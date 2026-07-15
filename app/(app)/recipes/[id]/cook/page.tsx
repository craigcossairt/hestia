import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CookShell } from "@/components/recipe/cook-shell";
import { orderIngredientsByFirstUse } from "@/lib/recipes/match-ingredients";
import type { Ingredient, Step } from "@/lib/types/database";

export default async function CookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, name, steps_json, ingredients_json")
    .eq("id", id)
    .maybeSingle();

  if (!recipe) notFound();

  const steps = (recipe.steps_json ?? []) as Step[];
  const ingredients = orderIngredientsByFirstUse(
    (recipe.ingredients_json ?? []) as Ingredient[],
    steps,
  );

  return (
    <CookShell
      recipeId={recipe.id}
      recipeName={recipe.name}
      steps={steps}
      ingredients={ingredients}
    />
  );
}
