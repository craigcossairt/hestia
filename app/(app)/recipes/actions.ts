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

// Edit-form patch payload. Every field is optional — undefined means
// "don't touch", null means "explicitly clear" (only valid for
// nullable columns like photo_url).
export interface RecipePatch {
  name?: string;
  photo_url?: string | null;
  time_min?: number;
  servings?: number;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  ingredients?: Array<{
    name: string;
    qty: number;
    unit: string;
    aisle?: string;
    optional?: boolean;
  }>;
  steps?: Array<{ text: string; timer_sec?: number }>;
  tags?: string[];
  tips?: string[];
}

// Update a recipe the user owns. RLS would block cross-user writes
// anyway, but we double-check ownership at the application layer so we
// can return a clean error string instead of a confusing PostgREST
// "0 rows affected" silent no-op.
export async function updateRecipe(recipeId: string, patch: RecipePatch) {
  const { supabase, user } = await getUserOrRedirect();

  const { data: existing } = await supabase
    .from("recipes")
    .select("owner_id")
    .eq("id", recipeId)
    .maybeSingle();
  if (!existing) return { error: "Recipe not found." };
  if (existing.owner_id !== user.id) {
    return { error: "You can't edit a recipe you don't own." };
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.photo_url !== undefined) update.photo_url = patch.photo_url;
  if (patch.time_min !== undefined) update.time_min = patch.time_min;
  if (patch.servings !== undefined) update.servings = patch.servings;
  if (patch.kcal !== undefined) update.kcal = patch.kcal;
  if (patch.protein !== undefined) update.protein = patch.protein;
  if (patch.carbs !== undefined) update.carbs = patch.carbs;
  if (patch.fat !== undefined) update.fat = patch.fat;
  if (patch.ingredients !== undefined)
    update.ingredients_json = patch.ingredients;
  if (patch.steps !== undefined) update.steps_json = patch.steps;
  if (patch.tags !== undefined) update.tags = patch.tags;
  if (patch.tips !== undefined) update.tips_json = patch.tips;

  const { error } = await supabase
    .from("recipes")
    .update(update)
    .eq("id", recipeId);
  if (error) return { error: error.message };

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

// Upload a recipe photo to the `recipe-photos` Storage bucket and
// return the public URL. Path: {user_id}/{recipe_id}/{ts}.{ext}.
//
// Called via the edit form's <input type="file"> handler. We accept
// the file as base64 from the client to keep this a simple server
// action (Next.js server actions don't yet stream multipart well).
export async function uploadRecipePhoto(args: {
  recipeId: string;
  filename: string; // original filename, used only for the extension
  base64: string; // raw base64 without the data: prefix
  contentType: string;
}) {
  const { supabase, user } = await getUserOrRedirect();
  const ext = args.filename.split(".").pop()?.toLowerCase() || "jpg";
  if (!/^(jpe?g|png|webp|gif)$/.test(ext)) {
    return { error: "Use JPG, PNG, WEBP, or GIF." };
  }
  // 8MB cap (post-decode). base64 is ~4/3 the binary size, so cap at
  // ~10.7MB encoded length.
  if (args.base64.length > 11_000_000) {
    return { error: "Image too large (8MB max)." };
  }

  const buffer = Buffer.from(args.base64, "base64");
  const path = `${user.id}/${args.recipeId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("recipe-photos")
    .upload(path, buffer, {
      contentType: args.contentType || `image/${ext === "jpg" ? "jpeg" : ext}`,
      upsert: false,
    });
  if (upErr) return { error: upErr.message };

  const { data: pub } = supabase.storage
    .from("recipe-photos")
    .getPublicUrl(path);

  // Persist the new URL on the recipe immediately so the form state and
  // DB stay in sync even if the user navigates away before saving.
  await supabase
    .from("recipes")
    .update({ photo_url: pub.publicUrl, updated_at: new Date().toISOString() })
    .eq("id", args.recipeId)
    .eq("owner_id", user.id);

  revalidatePath(`/recipes/${args.recipeId}`);
  return { ok: true, url: pub.publicUrl };
}
