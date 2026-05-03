"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { computeTargets, type TargetInputs } from "@/lib/ai/targets";
import { getXai, MODELS } from "@/lib/ai/grok";
import { blueprintPrompt } from "@/lib/ai/prompts/blueprint";
import type { Activity, Goal, Sex } from "@/lib/types/database";

async function getUserOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export interface ProfileUpdate {
  name?: string;
  sex?: Sex;
  age?: number;
  height_cm?: number;
  weight_kg?: number;
  activity?: Activity;
  goal?: Goal;
  dietary_restrictions?: string[];
  schedule?: { breakfast: string; lunch: string; dinner: string };
}

export async function updateProfile(update: ProfileUpdate) {
  const { supabase, user } = await getUserOrRedirect();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (update.name !== undefined) patch.name = update.name;
  if (update.sex !== undefined) patch.sex = update.sex;
  if (update.age !== undefined) patch.age = update.age;
  if (update.height_cm !== undefined) patch.height_cm = update.height_cm;
  if (update.weight_kg !== undefined) patch.weight_kg = update.weight_kg;
  if (update.activity !== undefined) patch.activity = update.activity;
  if (update.goal !== undefined) patch.goal = update.goal;
  if (update.dietary_restrictions !== undefined)
    patch.dietary_restrictions = update.dietary_restrictions;
  if (update.schedule !== undefined) patch.schedule_json = update.schedule;

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/me");
  revalidatePath("/today");
}

// Recompute kcal + macros from current profile body data, then write a fresh
// blueprint narrative as a new insight.
export async function recomputeTargets() {
  const { supabase, user } = await getUserOrRedirect();

  const { data: profile } = await supabase
    .from("profiles")
    .select("sex, age, height_cm, weight_kg, activity, goal")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile?.sex ||
    !profile.age ||
    !profile.height_cm ||
    !profile.weight_kg ||
    !profile.activity ||
    !profile.goal
  ) {
    return { error: "Fill in profile first." };
  }

  const inputs: TargetInputs = {
    sex: profile.sex,
    age: profile.age,
    height_cm: profile.height_cm,
    weight_kg: profile.weight_kg,
    activity: profile.activity,
    goal: profile.goal,
  };
  const targets = computeTargets(inputs);

  const { error: patchErr } = await supabase
    .from("profiles")
    .update({
      kcal_target: targets.kcal,
      protein_target: targets.protein_g,
      carbs_target: targets.carbs_g,
      fat_target: targets.fat_g,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (patchErr) return { error: patchErr.message };

  // Best-effort fresh narrative.
  try {
    const xai = getXai();
    const { text } = await generateText({
      model: xai(MODELS.fast),
      prompt: blueprintPrompt(inputs, targets),
    });
    await supabase.from("insights").insert({
      user_id: user.id,
      kind: "blueprint",
      body: text.trim(),
    });
  } catch (err) {
    console.warn("Recompute narrative skipped:", (err as Error).message);
  }

  revalidatePath("/me");
  revalidatePath("/today");
  return { ok: true, targets };
}

export async function updateAppearance(args: {
  accent_preset?: "charcoal" | "terracotta" | "forest" | "ink";
  dark_mode?: boolean;
}) {
  const { supabase, user } = await getUserOrRedirect();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (args.accent_preset !== undefined) patch.accent_preset = args.accent_preset;
  if (args.dark_mode !== undefined) patch.dark_mode = args.dark_mode;
  await supabase.from("profiles").update(patch).eq("id", user.id);
  revalidatePath("/me");
}

export async function updateFamily(
  members: Array<{
    id: string;
    name: string;
    age: number;
    sex?: "male" | "female" | "other";
    dietary_restrictions: string[];
    notes?: string;
    portion_modifier?: number;
  }>,
) {
  const { supabase, user } = await getUserOrRedirect();
  const { error } = await supabase
    .from("profiles")
    .update({
      family_json: members,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/me");
  revalidatePath("/family");
  revalidatePath("/coach");
}

export async function logWeight(value_kg: number, note?: string) {
  if (value_kg <= 20 || value_kg >= 300) {
    return { error: "Weight out of range." };
  }
  const { supabase, user } = await getUserOrRedirect();

  const { error } = await supabase.from("weight_logs").insert({
    user_id: user.id,
    value_kg,
    note: note ?? null,
  });
  if (error) return { error: error.message };

  // Also update the profile's current weight so Mifflin–St Jeor recompute uses
  // the latest measurement.
  await supabase
    .from("profiles")
    .update({ weight_kg: value_kg, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  revalidatePath("/me");
  revalidatePath("/stats");
}
