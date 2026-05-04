import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkAiQuota } from "@/lib/ai/quota";
import { getXai, MODELS } from "@/lib/ai/grok";
import { bulkParsePrompt, PantryItemsSchema } from "@/lib/ai/prompts/pantry";

const Body = z.object({ text: z.string().min(2).max(8000) });

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

  try {
    const xai = getXai();
    const { object } = await generateObject({
      model: xai(MODELS.fast),
      schema: PantryItemsSchema,
      prompt: bulkParsePrompt(parsed.data.text),
    });
    return NextResponse.json(object);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
