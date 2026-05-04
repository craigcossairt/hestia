import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkAiQuota } from "@/lib/ai/quota";
import { getXai, MODELS } from "@/lib/ai/grok";
import {
  MacroEstimateSchema,
  estimateMacrosPrompt,
} from "@/lib/ai/prompts/estimate-macros";
import { refineRecipeMacros } from "@/lib/nutrition/recipe-macros";

const Body = z.object({ description: z.string().min(2).max(300) });

export const maxDuration = 20;

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("dietary_restrictions, allergies")
    .eq("id", user.id)
    .maybeSingle();

  try {
    const xai = getXai();
    const { object } = await generateObject({
      model: xai(MODELS.fast),
      schema: MacroEstimateSchema,
      prompt: estimateMacrosPrompt({
        description: parsed.data.description,
        dietary_context: [
          ...(profile?.dietary_restrictions ?? []),
          ...(profile?.allergies ?? []),
        ],
      }),
    });

    // If the AI broke the meal into ingredients AND USDA_API_KEY is
    // configured, refine the eyeballed macros against FDC's per-100g
    // database. Same coverage gates as recipe save: ≥60% of named
    // ingredients matched + ≥150 kcal of matched food, otherwise we
    // keep the AI's original numbers. Servings=1 since a quick log
    // is one portion by definition.
    let refined: typeof object | null = null;
    if (object.ingredients && object.ingredients.length > 0) {
      try {
        const r = await refineRecipeMacros({
          ingredients: object.ingredients,
          servings: 1,
        });
        if (r) {
          refined = {
            ...object,
            kcal: r.kcal,
            protein: r.protein,
            carbs: r.carbs,
            fat: r.fat,
          };
        }
      } catch {
        // Best-effort. FDC failures fall back to the AI estimate.
      }
    }
    return NextResponse.json(refined ?? object);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
