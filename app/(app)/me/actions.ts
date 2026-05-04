"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { computeTargets, type TargetInputs } from "@/lib/ai/targets";
import { getXai, MODELS } from "@/lib/ai/grok";
import { blueprintPrompt } from "@/lib/ai/prompts/blueprint";
import type { Activity, Goal, Sex } from "@/lib/types/database";
import {
  buildPlanStaleHint,
  setPlanStaleHintCookie,
} from "@/lib/plans/staleness";

// Fields whose change should prompt the user to refresh their plan.
// Diet/health affects per-meal adaptations; body data affects target
// macros (and indirectly per-meal calorie counts). Anything outside
// these lists (e.g. name, schedule) doesn't move the plan needle.
const PLAN_DIET_FIELDS = [
  "dietary_restrictions",
  "allergies",
  "disliked_foods",
  "medical_conditions",
] as const;
const PLAN_BODY_FIELDS = [
  "sex",
  "age",
  "height_cm",
  "weight_kg",
  "activity",
  "goal",
] as const;

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
  allergies?: string[];
  disliked_foods?: string[];
  medical_conditions?: string[];
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
  if (update.allergies !== undefined) patch.allergies = update.allergies;
  if (update.disliked_foods !== undefined)
    patch.disliked_foods = update.disliked_foods;
  if (update.medical_conditions !== undefined)
    patch.medical_conditions = update.medical_conditions;
  if (update.schedule !== undefined) patch.schedule_json = update.schedule;

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return { error: error.message };

  // Plan-staleness hint when the patch touches anything that affects
  // upcoming meals. Body-data edits also offer a target recompute since
  // weight/age/activity/goal change Mifflin-St Jeor outputs.
  // updateMember handled this for family edits in PR #42 — this is the
  // missed self-edit path.
  const dietChanged = PLAN_DIET_FIELDS.some((f) => f in update);
  const bodyChanged = PLAN_BODY_FIELDS.some((f) => f in update);
  if (dietChanged || bodyChanged) {
    const reason =
      dietChanged && bodyChanged
        ? "Your body and diet/health profile changed"
        : dietChanged
          ? "Your diet or health profile changed"
          : "Your body profile changed";
    const hint = await buildPlanStaleHint(supabase, user.id, reason, {
      offerTargetRecompute: bodyChanged,
    });
    await setPlanStaleHintCookie(hint);
  }

  revalidatePath("/me");
  revalidatePath("/today");
  revalidatePath("/family");
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

export async function updateCookingPrefs(args: {
  auto_decrement_pantry?: boolean;
}) {
  const { supabase, user } = await getUserOrRedirect();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (args.auto_decrement_pantry !== undefined)
    patch.auto_decrement_pantry = args.auto_decrement_pantry;
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/me");
  return { ok: true };
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

// ─── Kroger store picker ──────────────────────────────────────────────
// Search nearby Kroger-family stores by ZIP. Wraps lib/kroger/locations
// so the picker can call it as a server action without exposing the
// Kroger API directly to the browser.
export type SearchKrogerLocationsResult =
  | { ok: true; stores: import("@/lib/kroger/locations").KrogerLocation[] }
  | { ok: false; error: string };

export async function searchKrogerLocations(
  zip: string,
): Promise<SearchKrogerLocationsResult> {
  const { searchLocations } = await import("@/lib/kroger/locations");
  const { isKrogerConfigured } = await import("@/lib/kroger/client");
  if (!isKrogerConfigured()) {
    return { ok: false, error: "Kroger isn't configured on the server." };
  }
  const stores = await searchLocations({ zip });
  return { ok: true, stores };
}

export async function savePreferredKrogerLocation(args: {
  locationId: string;
  locationName: string;
  zip: string;
  // Kroger banner code from the locations API ("SMITHS", "KROGER",
  // "FRYS", etc.). Persisted so /shop's "open cart" link can deep-
  // link to the user's actual banner site instead of generic
  // kroger.com (which routes to a default Texas store and can confuse
  // out-of-state users).
  chain?: string | null;
}) {
  const { supabase, user } = await getUserOrRedirect();
  const { error } = await supabase
    .from("profiles")
    .update({
      preferred_kroger_location_id: args.locationId,
      preferred_kroger_location_name: args.locationName,
      preferred_kroger_zip: args.zip,
      preferred_kroger_chain: args.chain ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/me");
  revalidatePath("/shop");
  return { ok: true };
}

// Revoke our locally-stored Kroger OAuth tokens. Doesn't formally
// notify Kroger that we're no longer authorised — that's a separate
// flow (Kroger doesn't expose a token-revocation endpoint on the
// public API anyway). Practically: we forget the tokens so future
// Send-to-Cart attempts kick off a fresh consent flow.
export async function disconnectKrogerAccount() {
  const { supabase, user } = await getUserOrRedirect();
  const { clearUserKrogerSession } = await import("@/lib/kroger/oauth");
  await clearUserKrogerSession({ supabase, userId: user.id });
  revalidatePath("/me");
  revalidatePath("/shop");
  return { ok: true };
}

// Update the household's "never add to shopping list" exclusion list.
// Items are stored lowercased + trimmed; /shop's derive step matches
// after canonicalisation so plurals/casing don't matter at use site.
export async function updateNeverShopItems(items: string[]) {
  const { supabase, user } = await getUserOrRedirect();
  // Normalise: trim, lowercase, drop empties + dupes, cap at 50.
  const cleaned = Array.from(
    new Set(
      items
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0 && s.length < 60),
    ),
  ).slice(0, 50);
  const { error } = await supabase
    .from("profiles")
    .update({
      never_shop_items: cleaned,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/me");
  revalidatePath("/shop");
  return { ok: true, items: cleaned };
}

export async function clearPreferredKrogerLocation() {
  const { supabase, user } = await getUserOrRedirect();
  await supabase
    .from("profiles")
    .update({
      preferred_kroger_location_id: null,
      preferred_kroger_location_name: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  revalidatePath("/me");
  revalidatePath("/shop");
  return { ok: true };
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
