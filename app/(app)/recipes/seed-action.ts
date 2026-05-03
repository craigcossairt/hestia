"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SEED_RECIPES } from "@/lib/seed/recipes";

// Bulk-insert the curated starter library as user-owned recipes (RLS prevents
// us from writing seed-library rows as a normal user). Auto-saves all of them.
export async function loadStarterRecipes() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing } = await supabase
    .from("recipes")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1);
  if (existing && existing.length > 0) {
    return { error: "You already have recipes — load skipped." };
  }

  const { data: inserted, error } = await supabase
    .from("recipes")
    .insert(
      SEED_RECIPES.map((r) => ({
        owner_id: user.id,
        name: r.name,
        photo_url: r.photo_url,
        ingredients_json: r.ingredients_json,
        steps_json: r.steps_json,
        kcal: r.kcal,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        time_min: r.time_min,
        tags: r.tags,
      })),
    )
    .select("id");

  if (error) return { error: error.message };

  // Auto-bookmark them so they appear in Saved tab too.
  if (inserted) {
    await supabase
      .from("saved_recipes")
      .insert(
        inserted.map((r: { id: string }) => ({
          user_id: user.id,
          recipe_id: r.id,
        })),
      );
  }

  revalidatePath("/recipes");
  return { ok: true, count: inserted?.length ?? 0 };
}
