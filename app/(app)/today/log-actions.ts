"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    .select("id, recipe_id, recipes:recipe_id(name, kcal, protein, carbs, fat)")
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

  revalidatePath("/today");
  revalidatePath("/plan");
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
}

// Log an ad-hoc meal not tied to the plan.
export async function logCustomMeal(payload: {
  recipe_id?: string | null;
  custom_name?: string | null;
  slot?: Slot | null;
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
    logged_at: new Date().toISOString(),
    kcal: payload.kcal,
    protein: payload.protein,
    carbs: payload.carbs,
    fat: payload.fat,
  });
  if (error) return { error: error.message };

  // If a slot was provided AND a planned entry exists for today/that slot
  // with no recipe yet, attach this log conceptually by also marking that
  // slot as logged. (Kept simple: we don't auto-attach the recipe.)
  if (payload.slot) {
    const today = new Date().toISOString().slice(0, 10);
    await supabase
      .from("meal_plan_entries")
      .update({ status: "logged" })
      .eq("user_id", user.id)
      .eq("date", today)
      .eq("slot", payload.slot);
  }

  revalidatePath("/today");
}

export async function undoLog(logId: string) {
  const { supabase, user } = await getUserOrRedirect();
  await supabase.from("meal_logs").delete().eq("id", logId).eq("user_id", user.id);
  // Don't revert the plan entry status — too ambiguous. User can re-log easily.
  revalidatePath("/today");
}
