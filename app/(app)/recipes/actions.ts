"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { GeneratedRecipe } from "@/lib/ai/prompts/recipe";
import { maybeRefineRecipe } from "@/lib/nutrition/recipe-macros";

async function getUserOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function saveGeneratedRecipe(
  recipe: GeneratedRecipe & {
    source_url?: string | null;
    source_image_url?: string | null;
    photo_url?: string | null;
  },
) {
  const { supabase, user } = await getUserOrRedirect();

  // Refine the AI's per-serving macros against USDA FoodData Central
  // when USDA_API_KEY is configured. No-op (returns input unchanged) when
  // the key is missing or coverage is too low to trust.
  const refined = await maybeRefineRecipe(recipe);

  const { data, error } = await supabase
    .from("recipes")
    .insert({
      owner_id: user.id,
      name: refined.name,
      photo_url: refined.photo_url ?? null,
      source_url: refined.source_url ?? null,
      source_image_url: refined.source_image_url ?? null,
      ingredients_json: refined.ingredients,
      steps_json: refined.steps,
      kcal: refined.kcal,
      protein: refined.protein,
      carbs: refined.carbs,
      fat: refined.fat,
      time_min: refined.time_min,
      servings: refined.servings ?? 4,
      family_notes_json: refined.family_modifications ?? [],
      tips_json: refined.tips ?? [],
      tags: refined.tags,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Auto-bookmark for the creator.
  await supabase
    .from("saved_recipes")
    .insert({ user_id: user.id, recipe_id: data.id })
    .select();

  revalidatePath("/recipes");
  return { id: data.id };
}

export async function toggleSavedRecipe(recipeId: string) {
  const { supabase, user } = await getUserOrRedirect();
  const { data: existing } = await supabase
    .from("saved_recipes")
    .select("recipe_id")
    .eq("user_id", user.id)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("saved_recipes")
      .delete()
      .eq("user_id", user.id)
      .eq("recipe_id", recipeId);
  } else {
    await supabase
      .from("saved_recipes")
      .insert({ user_id: user.id, recipe_id: recipeId });
  }
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
}

export async function rateRecipe(recipeId: string, rating: number) {
  if (rating < 1 || rating > 5) return { error: "Invalid rating" };
  const { supabase, user } = await getUserOrRedirect();
  await supabase
    .from("recipe_ratings")
    .upsert(
      {
        user_id: user.id,
        recipe_id: recipeId,
        rating,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,recipe_id" },
    );
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
}

export async function deleteRecipe(recipeId: string) {
  const { supabase } = await getUserOrRedirect();
  await supabase.from("recipes").delete().eq("id", recipeId);
  revalidatePath("/recipes");
  redirect("/recipes");
}
