"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { GeneratedRecipe } from "@/lib/ai/prompts/recipe";
import {
  formatMacroRefineError,
  maybeRefineRecipe,
  refineRecipeMacrosDetailed,
} from "@/lib/nutrition/recipe-macros";
import { orderIngredientsByFirstUse } from "@/lib/recipes/match-ingredients";
import { sanitizeStepsForSave } from "@/lib/recipes/sanitize-steps";
import type { Ingredient, Step } from "@/lib/types/database";

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
    prep_min?: number | null;
    cook_min?: number | null;
    /** May include photo_url beyond the AI schema. */
    steps?: Step[];
  },
) {
  const { supabase, user } = await getUserOrRedirect();

  // Refine the AI's per-serving macros against USDA FoodData Central
  // when USDA_API_KEY is configured. No-op (returns input unchanged) when
  // the key is missing or coverage is too low to trust.
  const refined = await maybeRefineRecipe(recipe);
  const steps = sanitizeStepsForSave(recipe.steps ?? refined.steps);
  const ingredients = orderIngredientsByFirstUse(
    refined.ingredients,
    steps,
  );

  const { data, error } = await supabase
    .from("recipes")
    .insert({
      owner_id: user.id,
      name: refined.name,
      photo_url: refined.photo_url ?? null,
      source_url: refined.source_url ?? null,
      source_image_url: refined.source_image_url ?? null,
      ingredients_json: ingredients,
      steps_json: steps,
      kcal: refined.kcal,
      protein: refined.protein,
      carbs: refined.carbs,
      fat: refined.fat,
      time_min: refined.time_min,
      prep_min: recipe.prep_min ?? null,
      cook_min: recipe.cook_min ?? null,
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
  prep_min?: number | null;
  cook_min?: number | null;
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
  steps?: Array<{
    text: string;
    timer_sec?: number;
    photo_url?: string | null;
  }>;
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
    .select("owner_id, ingredients_json, steps_json")
    .eq("id", recipeId)
    .maybeSingle();
  if (!existing) return { error: "Recipe not found." };
  if (existing.owner_id !== user.id) {
    return { error: "You can't edit a recipe you don't own." };
  }

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.photo_url !== undefined) update.photo_url = patch.photo_url;
  if (patch.time_min !== undefined) update.time_min = patch.time_min;
  if (patch.prep_min !== undefined) update.prep_min = patch.prep_min;
  if (patch.cook_min !== undefined) update.cook_min = patch.cook_min;
  if (patch.servings !== undefined) update.servings = patch.servings;
  if (patch.kcal !== undefined) update.kcal = patch.kcal;
  if (patch.protein !== undefined) update.protein = patch.protein;
  if (patch.carbs !== undefined) update.carbs = patch.carbs;
  if (patch.fat !== undefined) update.fat = patch.fat;
  if (patch.tags !== undefined) update.tags = patch.tags;
  if (patch.tips !== undefined) update.tips_json = patch.tips;

  // Keep the ingredient list in first-use order whenever ingredients or
  // steps change. Fetch the untouched side from the existing row.
  if (patch.ingredients !== undefined || patch.steps !== undefined) {
    const ingredients = (patch.ingredients ??
      existing.ingredients_json ??
      []) as Ingredient[];
    const rawSteps = (patch.steps ?? existing.steps_json ?? []) as Step[];
    const steps = sanitizeStepsForSave(rawSteps);
    update.ingredients_json = orderIngredientsByFirstUse(ingredients, steps);
    if (patch.steps !== undefined) update.steps_json = steps;
  }

  const { error } = await supabase
    .from("recipes")
    .update(update)
    .eq("id", recipeId);
  if (error) return { error: error.message };

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

// Upload an image to the `recipe-photos` Storage bucket and return the
// public URL. Path: {user_id}/{folder}/{ts}.{ext}.
//
// Called via file inputs as base64 — Next.js server actions don't yet
// stream multipart well. Never persists data: URIs to the DB.
async function uploadToRecipePhotos(args: {
  folder: string;
  filename: string;
  base64: string;
  contentType: string;
}): Promise<{ error: string } | { url: string }> {
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
  const path = `${user.id}/${args.folder}/${Date.now()}.${ext}`;
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

  return { url: pub.publicUrl };
}

// Upload a recipe hero photo. Path: {user_id}/{recipe_id}/{ts}.{ext}.
// Persists immediately on recipes.photo_url.
export async function uploadRecipePhoto(args: {
  recipeId: string;
  filename: string;
  base64: string;
  contentType: string;
}) {
  const { supabase, user } = await getUserOrRedirect();

  const { data: existing } = await supabase
    .from("recipes")
    .select("owner_id")
    .eq("id", args.recipeId)
    .maybeSingle();
  if (!existing) return { error: "Recipe not found." };
  if (existing.owner_id !== user.id) {
    return { error: "You can't edit a recipe you don't own." };
  }

  const uploaded = await uploadToRecipePhotos({
    folder: args.recipeId,
    filename: args.filename,
    base64: args.base64,
    contentType: args.contentType,
  });
  if ("error" in uploaded) return uploaded;

  const { error } = await supabase
    .from("recipes")
    .update({ photo_url: uploaded.url })
    .eq("id", args.recipeId)
    .eq("owner_id", user.id);
  if (error) return { error: error.message };

  revalidatePath(`/recipes/${args.recipeId}`);
  return { ok: true, url: uploaded.url };
}

// Upload a per-step photo. Path: {user_id}/{recipe_id}/steps/{ts}.{ext}.
// Persists immediately onto steps_json[stepIndex].photo_url.
export async function uploadStepPhoto(args: {
  recipeId: string;
  stepIndex: number;
  filename: string;
  base64: string;
  contentType: string;
}) {
  const { supabase, user } = await getUserOrRedirect();

  const { data: existing } = await supabase
    .from("recipes")
    .select("owner_id, steps_json")
    .eq("id", args.recipeId)
    .maybeSingle();
  if (!existing) return { error: "Recipe not found." };
  if (existing.owner_id !== user.id) {
    return { error: "You can't edit a recipe you don't own." };
  }

  const steps = [...((existing.steps_json ?? []) as Step[])];
  if (args.stepIndex < 0 || args.stepIndex >= steps.length) {
    return { error: "That step doesn't exist." };
  }

  const uploaded = await uploadToRecipePhotos({
    folder: `${args.recipeId}/steps`,
    filename: args.filename,
    base64: args.base64,
    contentType: args.contentType,
  });
  if ("error" in uploaded) return uploaded;

  steps[args.stepIndex] = {
    ...steps[args.stepIndex]!,
    photo_url: uploaded.url,
  };

  const { error } = await supabase
    .from("recipes")
    .update({ steps_json: steps })
    .eq("id", args.recipeId)
    .eq("owner_id", user.id);
  if (error) return { error: error.message };

  revalidatePath(`/recipes/${args.recipeId}`);
  revalidatePath(`/recipes/${args.recipeId}/cook`);
  revalidatePath(`/recipes/${args.recipeId}/edit`);
  return { ok: true, url: uploaded.url };
}

// Upload an image without writing steps_json (create/edit deferred save).
// Returns a public URL only — caller attaches it to a step and saves later.
// Default folder is "draft"; pass `${recipeId}/steps` for edit flows.
export async function uploadDraftRecipeImage(args: {
  filename: string;
  base64: string;
  contentType: string;
  folder?: string;
}) {
  const uploaded = await uploadToRecipePhotos({
    folder: args.folder ?? "draft",
    filename: args.filename,
    base64: args.base64,
    contentType: args.contentType,
  });
  if ("error" in uploaded) return uploaded;
  return { ok: true, url: uploaded.url };
}

/** Re-estimate per-serving macros from current ingredients via USDA. */
export async function recalculateRecipeMacros(
  recipeId: string,
  data: {
    ingredients: NonNullable<RecipePatch["ingredients"]>;
    servings: number;
  },
) {
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

  const result = await refineRecipeMacrosDetailed({
    ingredients: data.ingredients,
    servings: data.servings,
  });
  if (!result.ok) {
    return { error: formatMacroRefineError(result) };
  }
  const refined = result.macros;

  const { error } = await supabase
    .from("recipes")
    .update({
      kcal: refined.kcal,
      protein: refined.protein,
      carbs: refined.carbs,
      fat: refined.fat,
    })
    .eq("id", recipeId)
    .eq("owner_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  return {
    ok: true,
    kcal: refined.kcal,
    protein: refined.protein,
    carbs: refined.carbs,
    fat: refined.fat,
    coverage: refined.coverage,
  };
}
