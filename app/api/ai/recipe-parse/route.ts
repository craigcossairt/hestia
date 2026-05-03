import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getXai, MODELS } from "@/lib/ai/grok";
import { parseRecipeFromUrlPrompt, RecipeSchema } from "@/lib/ai/prompts/recipe";

const Body = z.object({ url: z.string().url() });

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

  let html = "";
  try {
    const res = await fetch(parsed.data.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Hestia recipe parser; contact: support@hestia.local)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Couldn't fetch URL (${res.status})` },
        { status: 422 },
      );
    }
    html = await res.text();
  } catch (err) {
    return NextResponse.json(
      { error: `Fetch failed: ${(err as Error).message}` },
      { status: 422 },
    );
  }

  // Strip scripts, styles, then collapse whitespace to keep prompt small.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  try {
    const xai = getXai();
    const { object } = await generateObject({
      model: xai(MODELS.fast),
      schema: RecipeSchema,
      prompt: parseRecipeFromUrlPrompt({ url: parsed.data.url, htmlExcerpt: text }),
    });
    return NextResponse.json({ ...object, source_url: parsed.data.url });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
