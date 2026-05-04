"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { computeTargets, type TargetInputs } from "@/lib/ai/targets";
import { getXai, MODELS } from "@/lib/ai/grok";
import { blueprintPrompt } from "@/lib/ai/prompts/blueprint";
import type { FamilyMember } from "@/lib/family";
import {
  buildPlanStaleHint,
  setPlanStaleHintCookie,
} from "@/lib/plans/staleness";

// Fields whose change should prompt the user to refresh their plan —
// these all feed into the recipe-generation prompt's per-member
// adaptations. Pure-cosmetic edits (name, age, weight, height) don't
// affect what's on the plate, so we skip the prompt for those.
const PLAN_RELEVANT_FIELDS: ReadonlyArray<keyof FamilyMember> = [
  "dietary_restrictions",
  "allergies",
  "disliked_foods",
  "medical_conditions",
  "portion_modifier",
  "active_programs",
];

function patchAffectsPlan(patch: Partial<FamilyMember>): boolean {
  return PLAN_RELEVANT_FIELDS.some((field) => field in patch);
}

async function getUserOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function loadFamily(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<FamilyMember[]> {
  const { data } = await supabase
    .from("profiles")
    .select("family_json")
    .eq("id", userId)
    .maybeSingle();
  return (data?.family_json as FamilyMember[] | null | undefined) ?? [];
}

async function saveFamily(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  family: FamilyMember[],
) {
  return supabase
    .from("profiles")
    .update({ family_json: family, updated_at: new Date().toISOString() })
    .eq("id", userId);
}

function bumpRevalidations(memberId: string) {
  revalidatePath("/family");
  revalidatePath(`/family/${memberId}`);
  revalidatePath("/coach");
  revalidatePath("/today");
  revalidatePath("/me");
}

export async function updateMember(
  memberId: string,
  patch: Partial<FamilyMember>,
) {
  const { supabase, user } = await getUserOrRedirect();
  const family = await loadFamily(supabase, user.id);
  const idx = family.findIndex((m) => m.id === memberId);
  if (idx === -1) return { error: "Family member not found." };

  const updated = family.map((m, i) =>
    i === idx ? { ...m, ...patch, id: m.id } : m,
  );
  const { error } = await saveFamily(supabase, user.id, updated);
  if (error) return { error: error.message };

  // If the patch touched fields that influence per-member plate
  // adaptations (allergies, dietary restrictions, etc.), drop a
  // plan-staleness hint so the next page render asks the user
  // whether to refresh upcoming plans.
  if (patchAffectsPlan(patch)) {
    const member = updated[idx];
    const hint = await buildPlanStaleHint(
      supabase,
      user.id,
      `${member.name}'s diet or health profile changed`,
    );
    await setPlanStaleHintCookie(hint);
  }

  bumpRevalidations(memberId);
  return { ok: true };
}

// Mifflin–St Jeor on the member's body data, then write the targets back to
// their family_json entry. Mirrors recomputeTargets in /me/actions.
export async function recomputeMemberTargets(memberId: string) {
  const { supabase, user } = await getUserOrRedirect();
  const family = await loadFamily(supabase, user.id);
  const idx = family.findIndex((m) => m.id === memberId);
  if (idx === -1) return { error: "Family member not found." };
  const m = family[idx];

  if (!m.sex || !m.age || !m.height_cm || !m.weight_kg || !m.activity || !m.goal) {
    return { error: "Fill in profile first." };
  }

  const inputs: TargetInputs = {
    sex: m.sex,
    age: m.age,
    height_cm: m.height_cm,
    weight_kg: m.weight_kg,
    activity: m.activity,
    goal: m.goal,
  };
  const targets = computeTargets(inputs);

  const updated = family.map((mm, i) =>
    i === idx
      ? {
          ...mm,
          kcal_target: targets.kcal,
          protein_target: targets.protein_g,
          carbs_target: targets.carbs_g,
          fat_target: targets.fat_g,
        }
      : mm,
  );
  const { error } = await saveFamily(supabase, user.id, updated);
  if (error) return { error: error.message };

  // Best-effort fresh narrative for the household member, stored as an insight
  // tagged with their name so the user can find it on Today.
  try {
    const xai = getXai();
    const { text } = await generateText({
      model: xai(MODELS.fast),
      prompt: blueprintPrompt(inputs, targets),
    });
    await supabase.from("insights").insert({
      user_id: user.id,
      kind: "blueprint",
      body: `${m.name}'s plan: ${text.trim()}`,
    });
  } catch (err) {
    console.warn("Member recompute narrative skipped:", (err as Error).message);
  }

  bumpRevalidations(memberId);
  return { ok: true, targets };
}

export async function logMemberWeight(
  memberId: string,
  value_kg: number,
  note?: string,
) {
  if (value_kg <= 20 || value_kg >= 300) {
    return { error: "Weight out of range." };
  }
  const { supabase, user } = await getUserOrRedirect();
  const family = await loadFamily(supabase, user.id);
  const idx = family.findIndex((m) => m.id === memberId);
  if (idx === -1) return { error: "Family member not found." };

  const { error: logErr } = await supabase.from("weight_logs").insert({
    user_id: user.id,
    family_member_id: memberId,
    value_kg,
    note: note ?? null,
  });
  if (logErr) return { error: logErr.message };

  // Mirror to the member's current weight so target recompute uses the latest.
  const updated = family.map((m, i) =>
    i === idx ? { ...m, weight_kg: value_kg } : m,
  );
  await saveFamily(supabase, user.id, updated);

  bumpRevalidations(memberId);
  return { ok: true };
}

export async function removeMember(memberId: string) {
  const { supabase, user } = await getUserOrRedirect();
  const family = await loadFamily(supabase, user.id);
  const removed = family.find((m) => m.id === memberId);
  const next = family.filter((m) => m.id !== memberId);
  const { error } = await saveFamily(supabase, user.id, next);
  if (error) return { error: error.message };

  // Drop any historical weight logs for the deleted member so the row counts
  // stay tidy. Logs for the account holder (family_member_id IS NULL) survive.
  await supabase
    .from("weight_logs")
    .delete()
    .eq("user_id", user.id)
    .eq("family_member_id", memberId);

  // Stale-plan hint — covers the bug where removed-member adaptations
  // hung around on existing recipes / plan entries.
  const hint = await buildPlanStaleHint(
    supabase,
    user.id,
    `${removed?.name ?? "A family member"} was removed from the household`,
  );
  await setPlanStaleHintCookie(hint);

  bumpRevalidations(memberId);
  redirect("/family");
}

export async function addMember(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };
  const { supabase, user } = await getUserOrRedirect();
  const family = await loadFamily(supabase, user.id);
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  const next: FamilyMember[] = [
    ...family,
    {
      id,
      name: trimmed,
      age: 30,
      dietary_restrictions: [],
      allergies: [],
      disliked_foods: [],
      medical_conditions: [],
      portion_modifier: 1,
      active_programs: [],
    },
  ];
  const { error } = await saveFamily(supabase, user.id, next);
  if (error) return { error: error.message };

  // Adding a member only matters for upcoming plans if the user has
  // already-generated entries that don't account for the new mouth.
  // The hint short-circuits to null when there are no upcoming
  // planned entries, so a fresh user adding their first member won't
  // see the prompt.
  const hint = await buildPlanStaleHint(
    supabase,
    user.id,
    `${trimmed} was added to the household`,
  );
  await setPlanStaleHintCookie(hint);

  revalidatePath("/family");
  revalidatePath("/me");
  return { ok: true, id };
}
