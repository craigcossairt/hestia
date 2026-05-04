import { H, Body, Label } from "@/components/ds";
import { createClient } from "@/lib/supabase/server";
import { LibraryTabs, type RecipeTab } from "@/components/recipe/library-tabs";
import { LibraryControls } from "@/components/recipe/library-controls";
import { AddRecipeFab } from "@/components/recipe/add-recipe-fab";
import { LoadStarterButton } from "@/components/recipe/load-starter-button";

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

  type RecipeRow = {
    id: string;
    name: string;
    photo_url: string | null;
    kcal: number | null;
    time_min: number | null;
    protein: number | null;
    tags: string[];
    ingredients_json: Array<{ name: string }>;
    owner_id: string | null;
    source_url: string | null;
  };
  let recipes: RecipeRow[] = [];
  let savedSet = new Set<string>();
  let ratings = new Map<string, number>();
  let pantryNames: string[] = [];

  if (user) {
    const [savedRes, ratingsRes, pantryRes] = await Promise.all([
      supabase.from("saved_recipes").select("recipe_id").eq("user_id", user.id),
      supabase.from("recipe_ratings").select("recipe_id, rating").eq("user_id", user.id),
      supabase.from("pantry_items").select("name").eq("user_id", user.id),
    ]);
    savedSet = new Set((savedRes.data ?? []).map((r) => r.recipe_id));
    ratings = new Map(
      (ratingsRes.data ?? []).map((r) => [r.recipe_id as string, r.rating as number]),
    );
    pantryNames = (pantryRes.data ?? []).map((p: { name: string }) => p.name);

    const select =
      "id, name, photo_url, kcal, time_min, protein, tags, ingredients_json, owner_id, source_url";

    if (tab === "saved") {
      const ids = [...savedSet];
      if (ids.length === 0) {
        recipes = [];
      } else {
        const { data } = await supabase
          .from("recipes")
          .select(select)
          .in("id", ids)
          .order("created_at", { ascending: false });
        recipes = (data ?? []) as unknown as RecipeRow[];
      }
    } else if (tab === "rated") {
      const ids = [...ratings.keys()];
      if (ids.length === 0) {
        recipes = [];
      } else {
        const { data } = await supabase.from("recipes").select(select).in("id", ids);
        recipes = ((data ?? []) as unknown as RecipeRow[]).sort(
          (a, b) => (ratings.get(b.id) ?? 0) - (ratings.get(a.id) ?? 0),
        );
      }
    } else {
      const { data } = await supabase
        .from("recipes")
        .select(select)
        .order("created_at", { ascending: false })
        .limit(60);
      recipes = (data ?? []) as unknown as RecipeRow[];
    }
  }

  const emptyMessage =
    tab === "saved"
      ? "Nothing bookmarked yet. Tap the bookmark on any recipe to save it."
      : tab === "rated"
        ? "No ratings yet. Open a recipe and tap the stars."
        : "No recipes yet — start with our curated starter library, then add your own.";

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-6xl mx-auto flex flex-col gap-6 relative">
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
        <div className="rounded-card border border-dashed border-ink-l p-10 flex flex-col items-center text-center gap-4">
          <Body dim>{emptyMessage}</Body>
          {tab === "all" && user ? <LoadStarterButton /> : null}
        </div>
      ) : (
        <LibraryControls
          recipes={recipes}
          saved={savedSet}
          ratings={ratings}
          pantryNames={pantryNames}
          emptyMessage={emptyMessage}
          currentUserId={user?.id ?? null}
        />
      )}

      <AddRecipeFab />
    </div>
  );
}
