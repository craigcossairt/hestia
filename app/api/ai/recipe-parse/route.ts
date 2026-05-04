import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getModel, getModelOpts } from "@/lib/ai/provider";
import { resolveRecipePhoto } from "@/lib/ai/photo";
import { parseRecipeFromUrlPrompt, RecipeSchema } from "@/lib/ai/prompts/recipe";

const Body = z.object({ url: z.string().url() });

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

    // Pull og:image before stripping markup so the parser keeps the
    // page's marketing photo for the recipe card.
    const ogMatch =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      ) ??
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      );
    const sourceImageUrl = ogMatch?.[1] ?? null;

    // Strip scripts, styles, then collapse whitespace to keep prompt small.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    let object;
    try {
      const result = await generateObject({
        model: getModel("fast"),
        schema: RecipeSchema,
        ...getModelOpts(),
        prompt: parseRecipeFromUrlPrompt({
          url: parsed.data.url,
          htmlExcerpt: text,
        }),
      });
      object = result.object;
    } catch (err) {
      return NextResponse.json(
        { error: `Parse failed: ${(err as Error).message}` },
        { status: 500 },
      );
    }

    // Photo: AI image url → og:image → web → pexels → ai-gen.
    const photo = await resolveRecipePhoto({
      recipeName: object.name,
      sourceUrl: parsed.data.url,
      aiImageUrl: object.image_url ?? null,
      promptHint: object.tags?.slice(0, 3).join(", "),
    });

    return NextResponse.json({
      ...object,
      source_url: parsed.data.url,
      source_image_url: sourceImageUrl,
      photo_url: photo?.url ?? sourceImageUrl ?? null,
      photo_source: photo?.source ?? (sourceImageUrl ? "og" : null),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${(err as Error).message ?? "unknown"}` },
      { status: 500 },
    );
  }
}
