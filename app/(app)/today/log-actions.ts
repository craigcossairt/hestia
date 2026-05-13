"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrementInventoryFromIngredients } from "@/app/(app)/inventory/actions";
import type { Slot } from "@/lib/types/database";

async function getUserOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// Log a planned meal (mark plan entry status='logged' + insert meal_log row).
export async function logPlannedMeal(planEntryId: string) {
  const { supabase, user } = await getUserOrRedirect();

  const { data: entry } = await supabase
    .from("meal_plan_entries")
    .select(
      "id, slot, recipe_id, recipes:recipe_id(name, kcal, protein, carbs, fat, ingredients_json)",
    )
    .eq("id", planEntryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!entry?.recipe_id) {
    return { error: "No recipe attached to this slot." };
  }

  const recipe = entry.recipes as unknown as {
    name: string;
    kcal: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    ingredients_json: Array<{ name: string; qty: number; unit: string }> | null;
  } | null;

  const [{ error: planErr }, { error: logErr }] = await Promise.all([
    supabase
      .from("meal_plan_entries")
      .update({ status: "logged" })
      .eq("id", planEntryId)
      .eq("user_id", user.id),
    supabase.from("meal_logs").insert({
      user_id: user.id,
      recipe_id: entry.recipe_id,
      slot: entry.slot,
      logged_at: new Date().toISOString(),
      kcal: recipe?.kcal ?? null,
      protein: recipe?.protein ?? null,
      carbs: recipe?.carbs ?? null,
      fat: recipe?.fat ?? null,
    }),
  ]);

  if (planErr || logErr) {
    return { error: planErr?.message ?? logErr?.message ?? "Failed to log." };
  }

  // Best-effort inventory decrement when the user has opted in. Non-blocking
  // — a failure here doesn't undo the log.
  const { data: prefs } = await supabase
    .from("profiles")
    .select("auto_decrement_pantry")
    .eq("id", user.id)
    .maybeSingle();
  if (prefs?.auto_decrement_pantry && recipe?.ingredients_json?.length) {
    try {
      await decrementInventoryFromIngredients(recipe.ingredients_json);
    } catch (err) {
      console.warn("auto-decrement skipped:", (err as Error).message);
    }
  }

  revalidatePath("/today");
  revalidatePath("/plan");
  // Pantry can shrink (auto-decrement) or recipe history can shift,
  // both of which affect what /shop says you still need.
  revalidatePath("/shop");
}

export async function skipPlannedMeal(planEntryId: string) {
  const { supabase, user } = await getUserOrRedirect();
  await supabase
    .from("meal_plan_entries")
    .update({ status: "skipped" })
    .eq("id", planEntryId)
    .eq("user_id", user.id);
  revalidatePath("/today");
  revalidatePath("/plan");
  // Pantry can shrink (auto-decrement) or recipe history can shift,
  // both of which affect what /shop says you still need.
  revalidatePath("/shop");
}

// Log an ad-hoc meal not tied to the plan. The slot (if provided) is now
// stored on the log itself, so the Today slot card picks it up directly even
// without a plan entry. logged_at can be overridden so users can log meals
// after-the-fact at the right time (defaults to now).
export async function logCustomMeal(payload: {
  recipe_id?: string | null;
  custom_name?: string | null;
  slot?: Slot | null;
  family_member_id?: string | null;
  logged_at?: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}) {
  const { supabase, user } = await getUserOrRedirect();
  if (!payload.recipe_id && !payload.custom_name) {
    return { error: "Need a recipe or a name." };
  }

  const { error } = await supabase.from("meal_logs").insert({
    user_id: user.id,
    recipe_id: payload.recipe_id ?? null,
    custom_name: payload.custom_name ?? null,
    slot: payload.slot ?? null,
    family_member_id: payload.family_member_id ?? null,
    logged_at: payload.logged_at ?? new Date().toISOString(),
    kcal: payload.kcal,
    protein: payload.protein,
    carbs: payload.carbs,
    fat: payload.fat,
  });
  if (error) return { error: error.message };

  // Mark the plan entry (if any) as logged so /plan reflects adherence.
  // Self-only — member views don't touch the household plan.
  if (payload.slot && !payload.family_member_id) {
    const date = (payload.logged_at ?? new Date().toISOString()).slice(0, 10);
    await supabase
      .from("meal_plan_entries")
      .update({ status: "logged" })
      .eq("user_id", user.id)
      .eq("date", date)
      .eq("slot", payload.slot);
  }

  revalidatePath("/today");
  revalidatePath("/stats");
  // Custom logs can flip an existing plan entry to "logged" (and may
  // shrink pantry indirectly if the user later auto-decrements). /shop
  // reads plan + pantry, so refresh it.
  revalidatePath("/shop");
}

export async function removeMealLog(logId: string) {
  const { supabase, user } = await getUserOrRedirect();

  // Read the log first so we can roll back the matching plan entry's
  // status if this log was created by "Mark eaten" on a planned slot.
  // Without this rollback, removing a log leaves the plan entry stuck
  // at status="logged" — the user can no longer mark it eaten and the
  // logged row is gone, so the meal is in a dead-end state.
  const { data: log } = await supabase
    .from("meal_logs")
    .select("recipe_id, slot, logged_at")
    .eq("id", logId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("meal_logs")
    .delete()
    .eq("id", logId)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  // Roll back the corresponding plan entry, if any. Only flip when:
  //  - the log had a slot + recipe + date (custom-name logs aren't
  //    tied to a plan entry)
  //  - the plan entry is currently "logged" (don't override "skipped"
  //    or any other status the user may have set explicitly)
  if (log?.slot && log.recipe_id && log.logged_at) {
    const date = log.logged_at.slice(0, 10);
    await supabase
      .from("meal_plan_entries")
      .update({ status: "planned" })
      .eq("user_id", user.id)
      .eq("date", date)
      .eq("slot", log.slot)
      .eq("recipe_id", log.recipe_id)
      .eq("status", "logged");
  }

  revalidatePath("/today");
  revalidatePath("/plan");
  revalidatePath("/stats");
  // Removing a log can flip a plan entry back to "planned" + restore
  // its place on the shop list, so refresh /shop too.
  revalidatePath("/shop");
}

// Backwards-compatible alias for older imports.
export const undoLog = removeMealLog;
