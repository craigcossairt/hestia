import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkAiQuota } from "@/lib/ai/quota";
import { getXai, MODELS } from "@/lib/ai/grok";
import { SundayPrepSchema, sundayPrepPrompt } from "@/lib/ai/prompts/sunday-prep";

export const maxDuration = 30;

const Body = z.object({
  user_request: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
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
      .select("goal, protein_target, dietary_restrictions")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("pantry_items").select("name").eq("user_id", user.id).limit(40),
  ]);

  try {
    const xai = getXai();
    const { object } = await generateObject({
      model: xai(MODELS.fast),
      schema: SundayPrepSchema,
      prompt: sundayPrepPrompt({
        goal: profile?.goal ?? null,
        protein_target: profile?.protein_target ?? null,
        dietary_restrictions: profile?.dietary_restrictions ?? [],
        pantry_hints: (pantry ?? []).map((p: { name: string }) => p.name),
        user_request: parsed.data.user_request,
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
