import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getXai, MODELS } from "@/lib/ai/grok";
import { generateRecipePrompt, RecipeSchema } from "@/lib/ai/prompts/recipe";

const Body = z.object({ prompt: z.string().min(3).max(500) });

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

  const [{ data: profile }, { data: pantry }] = await Promise.all([
    supabase
      .from("profiles")
      .select("dietary_restrictions, goal, protein_target")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("pantry_items").select("name").eq("user_id", user.id).limit(40),
  ]);

  try {
    const xai = getXai();
    const { object } = await generateObject({
      model: xai(MODELS.fast),
      schema: RecipeSchema,
      prompt: generateRecipePrompt({
        prompt: parsed.data.prompt,
        dietary_restrictions: profile?.dietary_restrictions ?? [],
        pantry_hints: (pantry ?? []).map((p: { name: string }) => p.name),
        goal: profile?.goal ?? undefined,
        protein_target: profile?.protein_target ?? undefined,
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
