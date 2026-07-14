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
import { normalizeGeneratedRecipe } from "@/lib/recipes/normalize-generated-recipe";
import { parseRecipeFromUrlPrompt, RecipeSchema } from "@/lib/ai/prompts/recipe";
import { assertSafeFetchUrl } from "@/lib/net/safe-url";

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

    const safeUrl = await assertSafeFetchUrl(parsed.data.url);
    if (!safeUrl.ok) {
      return NextResponse.json({ error: safeUrl.error }, { status: 400 });
    }

    let html = "";
    try {
      const res = await fetch(safeUrl.url.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Hestia recipe parser; contact: support@hestia.local)",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(10_000),
        redirect: "manual",
      });
      let finalRes = res;
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          return NextResponse.json(
            { error: "Recipe site returned a redirect without a Location." },
            { status: 422 },
          );
        }
        const next = await assertSafeFetchUrl(
          new URL(loc, safeUrl.url).toString(),
        );
        if (!next.ok) {
          return NextResponse.json({ error: next.error }, { status: 400 });
        }
        finalRes = await fetch(next.url.toString(), {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Hestia recipe parser; contact: support@hestia.local)",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(10_000),
          redirect: "manual",
        });
      }
      if (!finalRes.ok) {
        const friendly =
          finalRes.status === 410
            ? "That recipe page is gone — the site removed it. Try a different URL."
            : finalRes.status === 404
              ? "Couldn't find that page (404). Double-check the URL."
              : finalRes.status === 403 || finalRes.status === 401
                ? "That site blocked the request. Try a different recipe source."
                : finalRes.status === 429
                  ? "That site is rate-limiting requests. Try again in a minute."
                  : finalRes.status >= 500
                    ? "The recipe site is having issues right now. Try again later."
                    : `Couldn't fetch the page (${finalRes.status} ${finalRes.statusText || ""}).`;
        return NextResponse.json({ error: friendly }, { status: 422 });
      }
      html = await finalRes.text();
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

    const ogMatch =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      ) ??
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      );
    const sourceImageUrl = ogMatch?.[1] ?? null;

    const text = striptags(html, [], " ")
      .replace(/\s+/g, " ")
      .trim();

    let object;
    try {
      const result = await generateObject({
        model: getModel("fast"),
        schema: RecipeSchema,
        providerOptions: getProviderOptions({ disableSearch: true }),
        ...getModelOpts(),
        prompt: parseRecipeFromUrlPrompt({
          url: parsed.data.url,
          htmlExcerpt: text,
        }),
      });
      object = normalizeGeneratedRecipe(result.object);
    } catch (err) {
      const e = err as Error & { name?: string; cause?: unknown };
      console.error("recipe-parse failed", {
        name: e.name,
        message: e.message,
        cause: e.cause,
      });
      const lower = (e.message || "").toLowerCase();
      const friendly =
        lower.includes("zod") ||
        lower.includes("schema") ||
        lower.includes("validation")
          ? "Hestia couldn't read this page as a recipe — the page layout might be too unusual. Try a simpler recipe URL."
          : lower.includes("timeout") || lower.includes("timed out")
            ? "The model took too long to parse this page. Try again."
            : lower.includes("rate") || lower.includes("429")
              ? "The model is rate-limited right now. Try again in a minute."
              : `Couldn't parse the page: ${e.message || "unknown error"}.`;
      return NextResponse.json({ error: friendly }, { status: 500 });
    }

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
