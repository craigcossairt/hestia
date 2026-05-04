import Link from "next/link";
import { notFound } from "next/navigation";
import { H, Body, Btn, Label, Mono, FoodImage } from "@/components/ds";
import { createClient } from "@/lib/supabase/server";
import { IngredientList } from "@/components/recipe/ingredient-list";
import { StarRating } from "@/components/recipe/star-rating";
import { FamilyNotes, type FamilyNote } from "@/components/recipe/family-notes";
import { TipsList } from "@/components/recipe/tips-list";
import type { Ingredient, Step } from "@/lib/types/database";
import type { FamilyMember } from "@/lib/family";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: recipe } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!recipe) notFound();

  const isOwner = !!user && recipe.owner_id === user.id;

  let pantryNames = new Set<string>();
  let rating = 0;
  let currentFamilyNames = new Set<string>();
  if (user) {
    const [pantryRes, rateRes, profileRes] = await Promise.all([
      supabase.from("pantry_items").select("name").eq("user_id", user.id),
      supabase
        .from("recipe_ratings")
        .select("rating")
        .eq("user_id", user.id)
        .eq("recipe_id", id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("family_json")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    pantryNames = new Set(
      (pantryRes.data ?? []).map((p: { name: string }) => p.name.toLowerCase()),
    );
    rating = rateRes.data?.rating ?? 0;
    const family =
      (profileRes.data?.family_json as FamilyMember[] | null | undefined) ?? [];
    currentFamilyNames = new Set(
      family
        .map((m) => m.name?.trim().toLowerCase())
        .filter((n): n is string => !!n),
    );
  }

  const ingredients: Ingredient[] = recipe.ingredients_json ?? [];
  const steps: Step[] = recipe.steps_json ?? [];
  // Family modifications were generated when the recipe was saved.
  // Filter against the *current* household so notes for members the
  // user has since removed don't keep haunting the recipe card.
  // Non-owners (rare — recipes are owner-scoped via RLS, but the page
  // tolerates that case) see the notes as-stored since they're someone
  // else's per-member adaptations.
  const allFamilyNotes: FamilyNote[] = recipe.family_notes_json ?? [];
  const familyNotes: FamilyNote[] = isOwner
    ? allFamilyNotes.filter((n) =>
        currentFamilyNames.has(n.member_name?.trim().toLowerCase() ?? ""),
      )
    : allFamilyNotes;
  const tips: string[] = recipe.tips_json ?? [];
  const servings: number = recipe.servings ?? 4;

  return (
    <div className="flex flex-col">
      <div className="relative">
        <FoodImage
          name={recipe.name}
          src={recipe.photo_url ?? undefined}
          height={320}
          rounded={false}
          showLabel={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 flex flex-col gap-2 max-w-5xl mx-auto">
          <Label className="text-paper/80">
            {recipe.tags?.[0] ?? "recipe"}
          </Label>
          <h1 className="font-display text-paper text-[40px] md:text-[56px] font-medium leading-[1.05] tracking-[-1px]">
            {recipe.name}
          </h1>
        </div>
      </div>

      <div className="px-6 md:px-12 py-8 md:py-10 max-w-5xl mx-auto w-full flex flex-col gap-10">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Stat label="kcal / serving" value={recipe.kcal ?? "—"} />
          <Stat label="protein" value={recipe.protein != null ? `${recipe.protein}g` : "—"} />
          <Stat label="carbs" value={recipe.carbs != null ? `${recipe.carbs}g` : "—"} />
          <Stat label="fat" value={recipe.fat != null ? `${recipe.fat}g` : "—"} />
          <Stat label="time" value={recipe.time_min != null ? `${recipe.time_min}m` : "—"} />
          <Stat label="servings" value={servings} />
        </div>

        <div className="flex items-center gap-4">
          <StarRating recipeId={id} initialRating={rating} size={20} />
          <Body size="sm" dim>
            {rating ? `you rated this ${rating}/5` : "tap to rate"}
          </Body>
        </div>

        <section className="grid md:grid-cols-2 gap-10">
          <div className="flex flex-col gap-4">
            <Label>ingredients</Label>
            <IngredientList
              ingredients={ingredients}
              recipeName={recipe.name}
              pantryNames={pantryNames}
            />
          </div>
          <div className="flex flex-col gap-4">
            <Label>steps</Label>
            <ol className="flex flex-col gap-4">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-4">
                  <Mono className="text-ink-3 text-[18px] w-6 shrink-0 mt-0.5">
                    {String(i + 1).padStart(2, "0")}
                  </Mono>
                  <Body size="lg" className="text-ink-2">
                    {step.text}
                    {step.timer_sec ? (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-accent-tint text-accent font-mono">
                        {Math.round(step.timer_sec / 60)} min timer
                      </span>
                    ) : null}
                  </Body>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {tips.length > 0 ? <TipsList tips={tips} /> : null}

        {familyNotes.length > 0 ? <FamilyNotes notes={familyNotes} /> : null}

        {recipe.source_url ? (
          <Body size="sm" dim>
            Adapted from{" "}
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-ink"
            >
              {new URL(recipe.source_url).hostname}
            </a>
          </Body>
        ) : null}
      </div>

      <div className="sticky bottom-24 md:bottom-8 flex justify-center gap-3 pb-4 px-6">
        {isOwner ? (
          <Link href={`/recipes/${id}/edit`}>
            <Btn variant="outline" size="lg">
              edit
            </Btn>
          </Link>
        ) : null}
        <Link href={`/recipes/${id}/cook`}>
          <Btn variant="primary" size="lg">
            start cooking →
          </Btn>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 p-4 rounded-card border border-ink-l bg-card">
      <Label>{label}</Label>
      <Mono className="text-ink text-[22px] font-medium leading-none">
        {value}
      </Mono>
    </div>
  );
}
