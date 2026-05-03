import { H, Body, Label } from "@/components/ds";
import { createClient } from "@/lib/supabase/server";
import { RecipeCard } from "@/components/recipe/recipe-card";
import { LibraryTabs, type RecipeTab } from "@/components/recipe/library-tabs";
import { AddRecipeFab } from "@/components/recipe/add-recipe-fab";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function RecipesPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { tab: tabParam } = await searchParams;
  const tab = (tabParam ?? "all") as RecipeTab;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let recipes: Array<{
    id: string;
    name: string;
    photo_url: string | null;
    kcal: number | null;
    time_min: number | null;
    tags: string[];
  }> = [];
  let savedSet = new Set<string>();
  let ratings = new Map<string, number>();

  if (user) {
    const [savedRes, ratingsRes] = await Promise.all([
      supabase.from("saved_recipes").select("recipe_id").eq("user_id", user.id),
      supabase.from("recipe_ratings").select("recipe_id, rating").eq("user_id", user.id),
    ]);
    savedSet = new Set((savedRes.data ?? []).map((r) => r.recipe_id));
    ratings = new Map(
      (ratingsRes.data ?? []).map((r) => [r.recipe_id as string, r.rating as number]),
    );

    if (tab === "saved") {
      const ids = [...savedSet];
      if (ids.length === 0) {
        recipes = [];
      } else {
        const { data } = await supabase
          .from("recipes")
          .select("id, name, photo_url, kcal, time_min, tags")
          .in("id", ids)
          .order("created_at", { ascending: false });
        recipes = data ?? [];
      }
    } else if (tab === "rated") {
      const ids = [...ratings.keys()];
      if (ids.length === 0) {
        recipes = [];
      } else {
        const { data } = await supabase
          .from("recipes")
          .select("id, name, photo_url, kcal, time_min, tags")
          .in("id", ids);
        recipes = (data ?? []).sort(
          (a, b) => (ratings.get(b.id) ?? 0) - (ratings.get(a.id) ?? 0),
        );
      }
    } else {
      const { data } = await supabase
        .from("recipes")
        .select("id, name, photo_url, kcal, time_min, tags")
        .order("created_at", { ascending: false })
        .limit(60);
      recipes = data ?? [];
    }
  }

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-6xl mx-auto flex flex-col gap-8 relative">
      <header className="flex flex-col gap-3">
        <Label>library</Label>
        <H size="xl" as="h1">
          Recipes
        </H>
        <Body size="lg" dim>
          Saved, rated, and everything you&apos;ve added.
        </Body>
      </header>

      <LibraryTabs />

      {recipes.length === 0 ? (
        <div className="rounded-card border border-dashed border-ink-l p-10 text-center">
          <Body dim>
            {tab === "saved"
              ? "Nothing bookmarked yet. Tap the bookmark on any recipe to save it."
              : tab === "rated"
                ? "No ratings yet. Open a recipe and tap the stars."
                : "No recipes yet. Use the + button to add one."}
          </Body>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {recipes.map((r) => (
            <RecipeCard
              key={r.id}
              id={r.id}
              name={r.name}
              photoUrl={r.photo_url}
              kcal={r.kcal}
              timeMin={r.time_min}
              rating={ratings.get(r.id) ?? 0}
              saved={savedSet.has(r.id)}
              tags={r.tags ?? []}
            />
          ))}
        </div>
      )}

      <AddRecipeFab />
    </div>
  );
}
