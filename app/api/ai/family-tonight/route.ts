import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkAiQuota } from "@/lib/ai/quota";
import { getXai, MODELS } from "@/lib/ai/grok";
import {
  FamilyTonightSchema,
  familyTonightPrompt,
} from "@/lib/ai/prompts/family-tonight";
import type { FamilyMember } from "@/lib/family";

export const maxDuration = 30;

const Body = z.object({
  recipe_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quota = await checkAiQuota(supabase, user.id);
  if (!quota.ok && quota.response) return quota.response;

  const [{ data: profile }, { data: recipe }] = await Promise.all([
    supabase
      .from("profiles")
      .select("family_json")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("recipes")
      .select("name, ingredients_json, steps_json, kcal, protein, time_min, tags")
      .eq("id", parsed.data.recipe_id)
      .maybeSingle(),
  ]);

  const family = (profile?.family_json as FamilyMember[] | null) ?? [];
  if (family.length === 0) {
    return NextResponse.json(
      { error: "No family members configured." },
      { status: 412 },
    );
  }
  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }

  // Build a compact summary of the recipe for the prompt.
  type Ing = { name: string; qty: number; unit: string };
  const ing = (recipe.ingredients_json as Ing[] | null) ?? [];
  const summary = [
    `Macros: ${recipe.kcal ?? "—"} kcal, ${recipe.protein ?? "—"}g protein per serving.`,
    recipe.time_min ? `Time: ${recipe.time_min} min.` : "",
    `Tags: ${(recipe.tags ?? []).join(", ") || "none"}.`,
    `Ingredients: ${ing.slice(0, 12).map((i) => `${i.qty} ${i.unit} ${i.name}`).join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const xai = getXai();
    const { object } = await generateObject({
      model: xai(MODELS.fast),
      schema: FamilyTonightSchema,
      prompt: familyTonightPrompt({
        recipe_name: recipe.name,
        recipe_summary: summary,
        members: family,
      }),
    });
    return NextResponse.json(object);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
