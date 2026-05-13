import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import striptags from "striptags";
import { createClient } from "@/lib/supabase/server";
import { checkAiQuota } from "@/lib/ai/quota";
import {
  getModel,
  getModelOpts,
  getProviderOptions,
} from "@/lib/ai/provider";
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

    const quota = await checkAiQuota(supabase, user.id);
    if (!quota.ok && quota.response) return quota.response;

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
        // Friendlier per-status messages so the modal doesn't surface
        // bare codes like "Gone" or "Forbidden".
        const friendly =
          res.status === 410
            ? "That recipe page is gone — the site removed it. Try a different URL."
            : res.status === 404
              ? "Couldn't find that page (404). Double-check the URL."
              : res.status === 403 || res.status === 401
                ? "That site blocked the request. Try a different recipe source."
                : res.status === 429
                  ? "That site is rate-limiting requests. Try again in a minute."
                  : res.status >= 500
                    ? "The recipe site is having issues right now. Try again later."
                    : `Couldn't fetch the page (${res.status} ${res.statusText || ""}).`;
        return NextResponse.json({ error: friendly }, { status: 422 });
      }
      html = await res.text();
    } catch (err) {
      const msg = (err as Error).message;
      const friendly =
        /timeout|aborted/i.test(msg)
          ? "The recipe page took too long to load. Try again, or pick a faster source."
          : /enotfound|getaddrinfo/i.test(msg)
            ? "Couldn't reach that domain. Check the URL is correct."
            : `Couldn't fetch the page: ${msg}`;
      return NextResponse.json({ error: friendly }, { status: 422 });
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

    // Strip scripts, styles, then all remaining tags. The previous regex
    // chain was flagged by CodeQL (js/bad-tag-filter +
    // js/incomplete-multi-character-sanitization) because hand-rolled
    // tag regexes can be bypassed by nested patterns like
    // `<scr<script>ipt>` and don't handle attribute values with `>`
    // characters. striptags is a small dedicated parser that handles
    // both cases. The output is fed straight to the AI prompt — there's
    // no XSS surface here, but using a real parser also eliminates the
    // class of CodeQL alert.
    const text = striptags(html, [], " ")
      .replace(/\s+/g, " ")
      .trim();

    let object;
    try {
      const result = await generateObject({
        model: getModel("fast"),
        schema: RecipeSchema,
        // Disable xAI's auto live-search for this route. We already
        // have the page's HTML, so search is at best wasted budget and
        // at worst a source of opaque errors (xAI's search subsystem
        // has been known to surface "Gone" / "503" type errors when a
        // searched host blocks its crawler — those bubble up as the
        // generateObject error message even though our own fetch
        // returned 200).
        providerOptions: getProviderOptions({ disableSearch: true }),
        ...getModelOpts(),
        prompt: parseRecipeFromUrlPrompt({
          url: parsed.data.url,
          htmlExcerpt: text,
        }),
      });
      object = result.object;
    } catch (err) {
      // Log the full error server-side so future failures are
      // diagnosable from Vercel logs (the user only sees the friendly
      // message). Categorise into something actionable when we can.
      const e = err as Error & { name?: string; cause?: unknown };
      console.error("recipe-parse failed", {
        name: e.name,
        message: e.message,
        cause: e.cause,
      });
      const lower = (e.message || "").toLowerCase();
      const friendly =
        lower.includes("zod") || lower.includes("schema") || lower.includes("validation")
          ? "Hestia couldn't read this page as a recipe — the page layout might be too unusual. Try a simpler recipe URL."
          : lower.includes("timeout") || lower.includes("timed out")
            ? "The model took too long to parse this page. Try again."
            : lower.includes("rate") || lower.includes("429")
              ? "The model is rate-limited right now. Try again in a minute."
              : `Couldn't parse the page: ${e.message || "unknown error"}.`;
      return NextResponse.json({ error: friendly }, { status: 500 });
    }

    // Photo: AI image url → og:image → web → pexels → ai-gen. supabase +
    // user passed so the ai-gen fallback can upload to Storage and
    // return an https:// URL instead of a multi-MB data: URI (see
    // lib/ai/photo.ts).
    const photo = await resolveRecipePhoto({
      recipeName: object.name,
      sourceUrl: parsed.data.url,
      aiImageUrl: object.image_url ?? null,
      promptHint: object.tags?.slice(0, 3).join(", "),
      supabase,
      userId: user.id,
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
