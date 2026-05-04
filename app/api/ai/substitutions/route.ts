import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkAiQuota } from "@/lib/ai/quota";
import { getXai, MODELS } from "@/lib/ai/grok";
import { substitutionPrompt, SubstitutionsSchema } from "@/lib/ai/prompts/recipe";

const Body = z.object({
  ingredient: z.string().min(1),
  recipe_name: z.string().min(1),
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

  const [{ data: profile }, { data: pantry }] = await Promise.all([
    supabase
      .from("profiles")
      .select("dietary_restrictions")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("pantry_items").select("name").eq("user_id", user.id).limit(40),
  ]);

  try {
    const xai = getXai();
    const { object } = await generateObject({
      model: xai(MODELS.fast),
      schema: SubstitutionsSchema,
      prompt: substitutionPrompt({
        ingredient: parsed.data.ingredient,
        recipe_name: parsed.data.recipe_name,
        pantry_hints: (pantry ?? []).map((p: { name: string }) => p.name),
        dietary_restrictions: profile?.dietary_restrictions ?? [],
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
