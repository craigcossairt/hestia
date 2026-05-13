import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkAiQuota } from "@/lib/ai/quota";
import {
  getModel,
  getModelOpts,
  getProviderOptions,
} from "@/lib/ai/provider";
import { resolveRecipePhoto } from "@/lib/ai/photo";
import { generateRecipePrompt, RecipeSchema } from "@/lib/ai/prompts/recipe";
import type { FamilyMember } from "@/lib/family";

const Body = z.object({ prompt: z.string().min(3).max(500) });

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const quota = await checkAiQuota(supabase, user.id);
    if (!quota.ok && quota.response) return quota.response;

    const [{ data: profile }, { data: pantry }] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "dietary_restrictions, allergies, disliked_foods, medical_conditions, goal, protein_target, family_json",
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("pantry_items")
        .select("name")
        .eq("user_id", user.id)
        .limit(40),
    ]);

    const family = (
      (profile as { family_json?: FamilyMember[] | null } | null)?.family_json ??
      []
    ).filter((f) => f.name && f.name.trim().length > 0);

    const allergies = Array.from(
      new Set([
        ...(profile?.allergies ?? []),
        ...family.flatMap((f) => f.allergies ?? []),
      ]),
    );
    const disliked_foods = Array.from(
      new Set([
        ...(profile?.disliked_foods ?? []),
        ...family.flatMap((f) => f.disliked_foods ?? []),
      ]),
    );
    const medical_conditions = Array.from(
      new Set([
        ...(profile?.medical_conditions ?? []),
        ...family.flatMap((f) => f.medical_conditions ?? []),
      ]),
    );

    let object;
    try {
      const result = await generateObject({
        model: getModel("fast"),
        schema: RecipeSchema,
        providerOptions: getProviderOptions(),
        ...getModelOpts(),
        prompt: generateRecipePrompt({
          prompt: parsed.data.prompt,
          dietary_restrictions: profile?.dietary_restrictions ?? [],
          allergies,
          disliked_foods,
          medical_conditions,
          pantry_hints: (pantry ?? []).map((p: { name: string }) => p.name),
          goal: profile?.goal ?? undefined,
          protein_target: profile?.protein_target ?? undefined,
          household_size: 1 + family.length,
          family: family.map((f) => ({
            name: f.name,
            age: f.age,
            dietary_restrictions: f.dietary_restrictions ?? [],
            allergies: f.allergies ?? [],
            disliked_foods: f.disliked_foods ?? [],
            medical_conditions: f.medical_conditions ?? [],
            portion_modifier: f.portion_modifier,
            notes: f.notes,
          })),
        }),
      });
      object = result.object;
    } catch (err) {
      return NextResponse.json(
        { error: `Generation failed: ${(err as Error).message}` },
        { status: 500 },
      );
    }

    // Best-effort photo. Doesn't block the recipe — null falls through to
    // the FoodImage SVG on the client. AI's own image_url (if any) gets
    // first crack so we don't pay for two web searches. supabase + user
    // passed so the ai-gen fallback can upload to Storage (we never
    // return data: URIs — see lib/ai/photo.ts).
    const photo = await resolveRecipePhoto({
      recipeName: object.name,
      aiImageUrl: object.image_url ?? null,
      promptHint: object.tags?.slice(0, 3).join(", "),
      supabase,
      userId: user.id,
    });

    return NextResponse.json({
      ...object,
      photo_url: photo?.url ?? null,
      photo_source: photo?.source ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${(err as Error).message ?? "unknown"}` },
      { status: 500 },
    );
  }
}
