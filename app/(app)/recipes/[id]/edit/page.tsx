import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { H, Body, Label } from "@/components/ds";
import { createClient } from "@/lib/supabase/server";
import { EditRecipeForm } from "@/components/recipe/edit-recipe-form";
import type { Ingredient, Step } from "@/lib/types/database";
import { orderIngredientsByFirstUse } from "@/lib/recipes/match-ingredients";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: recipe } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!recipe) notFound();
  // Owner-only: bounce back to the detail page if someone tries to edit
  // a recipe they don't own. The server action would also reject, but a
  // pre-flight check keeps the UX clean.
  if (recipe.owner_id !== user.id) redirect(`/recipes/${id}`);

  const steps = (recipe.steps_json ?? []) as Step[];
  const ingredients = orderIngredientsByFirstUse(
    (recipe.ingredients_json ?? []) as Ingredient[],
    steps,
  );

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-3xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Label>edit recipe</Label>
        <H size="xl" as="h1">
          {recipe.name}
        </H>
        <Body size="sm" dim>
          Changes save immediately on the form below.{" "}
          <Link
            href={`/recipes/${id}`}
            className="underline underline-offset-2 hover:text-ink"
          >
            Back to recipe
          </Link>
        </Body>
      </header>

      <EditRecipeForm
        recipeId={id}
        initial={{
          name: recipe.name,
          photo_url: recipe.photo_url ?? null,
          time_min: recipe.time_min ?? 30,
          prep_min: recipe.prep_min,
          cook_min: recipe.cook_min,
          servings: recipe.servings ?? 4,
          kcal: recipe.kcal ?? 0,
          protein: recipe.protein ?? 0,
          carbs: recipe.carbs ?? 0,
          fat: recipe.fat ?? 0,
          ingredients,
          steps,
          tags: recipe.tags ?? [],
          tips: recipe.tips_json ?? [],
        }}
      />
    </div>
  );
}
