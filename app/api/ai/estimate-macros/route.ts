import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getXai, MODELS } from "@/lib/ai/grok";
import {
  MacroEstimateSchema,
  estimateMacrosPrompt,
} from "@/lib/ai/prompts/estimate-macros";

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
    return NextResponse.json(object);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
