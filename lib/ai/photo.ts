// Recipe photo resolver. Tries the cheapest, most reliable source first
// and falls back through several layers — every layer is best-effort and
// returns null on failure so callers can handle "no photo" gracefully.
//
// Order (cheapest → most expensive):
//   0. AI-provided image URL — when the model has live search enabled
//      (e.g. Grok), it can return a representative real-photo URL with
//      the recipe. Skipping this would mean paying for two searches
//      (the AI's + ours) for the same recipe.
//   1. og:image extraction — when a recipe was parsed from a webpage,
//      the page's own marketing image is the gold standard.
//   2. Pexels search — free with a generous tier (~200 req/hour). Try
//      this BEFORE Brave so a 21-recipe plan doesn't burn through
//      paid Brave quota on common dishes Pexels covers fine.
//   3. Brave web image search — better at niche/specific dish names but
//      paid (~$0.10 per query at the entry tier; $5 free monthly burns
//      after ~50 queries). Fallback only.
//   4. AI image generation — slowest + most expensive; creative
//      fallback when search misses.
//   5. null — caller renders a FoodImage SVG fallback.

import { experimental_generateImage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getImageModel } from "./provider";

export interface ResolvedPhoto {
  url: string;
  source: "ai_search" | "og" | "web" | "pexels" | "ai_gen";
}

export async function resolveRecipePhoto(args: {
  recipeName: string;
  sourceUrl?: string | null;
  // URL the AI returned alongside the recipe (likely from its own web
  // search). When present and points at a real image, we use it directly
  // instead of running another search.
  aiImageUrl?: string | null;
  // Short cuisine / style hint for AI image gen and search refinement
  // (e.g. "creamy pasta dish, Italian, photographed from above").
  promptHint?: string;
  // Supabase client + userId — required to enable the AI image-generation
  // fallback. AI-gen images come back as base64 and are uploaded to the
  // recipe-photos bucket under {userId}/ai-gen/{ts}.png so we can persist
  // a normal https:// URL on recipes.photo_url. Without these, the AI-gen
  // fallback is skipped (returns null after web search) to avoid the
  // previous bug where multi-MB base64 data URIs were stored in the DB
  // and re-served in every HTML payload, locking up browsers.
  supabase?: SupabaseClient;
  userId?: string;
}): Promise<ResolvedPhoto | null> {
  const { recipeName, sourceUrl, aiImageUrl, promptHint, supabase, userId } =
    args;

  // 0. AI's own search result
  if (aiImageUrl) {
    const validated = await validateImageUrl(aiImageUrl);
    if (validated) return { url: validated, source: "ai_search" };
  }

  // 1. Source page og:image
  if (sourceUrl) {
    const og = await tryExtractOgImage(sourceUrl);
    if (og) return { url: og, source: "og" };
  }

  // 2. Pexels (free, generous quota — try first to spare Brave $$).
  const pex = await tryPexelsSearch(recipeName);
  if (pex) return { url: pex, source: "pexels" };

  // 3. Brave web image search (paid, but better at niche/specific names).
  const web = await tryWebImageSearch(recipeName, promptHint);
  if (web) return { url: web, source: "web" };

  // 4. AI image generation (slowest + most expensive). Only when we have
  //    a Supabase client + user — otherwise we'd persist a data URI which
  //    is a known browser-lockup vector at scale.
  if (supabase && userId) {
    const ai = await tryGenerateAiPhoto({
      name: recipeName,
      hint: promptHint,
      supabase,
      userId,
    });
    if (ai) return { url: ai, source: "ai_gen" };
  }

  return null;
}

// HEAD-checks the URL and confirms it points at an image (Content-Type
// starts with image/). Falls back to extension sniffing if HEAD isn't
// allowed. Returns the (possibly canonical) URL on success; null otherwise.
async function validateImageUrl(url: string): Promise<string | null> {
  if (!/^https?:\/\//.test(url)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "HestiaBot/1.0" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.startsWith("image/")) return url;
    return null;
  } catch {
    // HEAD blocked or network error — fall back to extension check so a
    // direct .jpg/.png link still passes.
    if (/\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(url)) return url;
    return null;
  }
}

// Lightweight og:image extractor. Avoids pulling in a full HTML parser —
// regex is fine for the meta tag.
async function tryExtractOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "HestiaBot/1.0 (recipe photo extractor)",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      ) ??
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      ) ??
      html.match(
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      );
    if (!m) return null;
    const candidate = m[1];
    if (!/^https?:\/\//.test(candidate)) {
      try {
        return new URL(candidate, url).toString();
      } catch {
        return null;
      }
    }
    return candidate;
  } catch {
    return null;
  }
}

interface BraveImageResponse {
  results?: Array<{
    properties?: { url?: string };
    thumbnail?: { src?: string };
    url?: string;
  }>;
}

// Brave Search Image API. Free tier 2k queries/month — generous for our
// needs (one query per generated recipe). Set BRAVE_SEARCH_API_KEY.
async function tryWebImageSearch(
  query: string,
  hint?: string,
): Promise<string | null> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;
  try {
    const refined = hint ? `${query} ${hint}` : `${query} food recipe`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(refined)}&count=5&safesearch=strict`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
      },
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = (await res.json()) as BraveImageResponse;
    // Prefer a full-size result over the thumbnail.
    for (const r of json.results ?? []) {
      const url = r.properties?.url ?? r.url ?? r.thumbnail?.src;
      if (url && /^https?:\/\//.test(url)) return url;
    }
    return null;
  } catch {
    return null;
  }
}

interface PexelsResponse {
  photos?: Array<{
    src?: { large?: string; medium?: string; original?: string };
  }>;
}

async function tryPexelsSearch(query: string): Promise<string | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(`${query} food`)}&per_page=1&orientation=landscape`,
      {
        signal: controller.signal,
        headers: { Authorization: apiKey },
      },
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = (await res.json()) as PexelsResponse;
    const first = json.photos?.[0];
    return first?.src?.large ?? first?.src?.original ?? first?.src?.medium ?? null;
  } catch {
    return null;
  }
}

// Generates an image via the configured AI provider, uploads it to the
// recipe-photos bucket, and returns the public URL.
//
// Previously this returned a `data:image/png;base64,…` URL directly. That
// looked convenient but was a memory-leak vector: the resulting ~1.3 MB
// string got persisted to recipes.photo_url and inlined into every HTML
// page that listed the recipe. A 21-meal plan + Today + Recipes index
// could push 30 MB of base64 into one document and lock up the browser.
// Storing to Storage and returning the public URL fixes this — every
// downstream page now just sees a normal https:// asset URL.
async function tryGenerateAiPhoto(args: {
  name: string;
  hint?: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<string | null> {
  const { name, hint, supabase, userId } = args;
  const model = getImageModel();
  if (!model) return null;
  try {
    const description = hint ? `${name}. ${hint}` : name;
    const result = await experimental_generateImage({
      model,
      prompt:
        `Appetizing food photograph of: ${description}. Top-down or three-quarter angle, ` +
        `natural light, shallow depth of field, no text, no watermarks, ` +
        `editorial style on a clean surface.`,
      n: 1,
      size: "1024x1024",
    });
    const image = result.image;
    if (!image) return null;
    const base64 =
      (image as { base64?: string; mimeType?: string }).base64 ??
      (typeof image === "string" ? image : null);
    if (!base64) return null;
    const mime = (image as { mimeType?: string }).mimeType ?? "image/png";
    const ext = mime.split("/")[1]?.split("+")[0] ?? "png";

    // Stash under {userId}/ai-gen/ so the recipe-photos RLS policy
    // (first folder segment must equal auth.uid()) allows the write.
    // No recipe_id in the path because at photo-resolution time the
    // recipe row hasn't been inserted yet — collisions are avoided
    // with a timestamp + random suffix.
    const buffer = Buffer.from(base64, "base64");
    const rand = Math.random().toString(36).slice(2, 10);
    const path = `${userId}/ai-gen/${Date.now()}-${rand}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("recipe-photos")
      .upload(path, buffer, { contentType: mime, upsert: false });
    if (upErr) {
      console.warn("ai photo upload failed", upErr.message);
      return null;
    }
    const { data: pub } = supabase.storage
      .from("recipe-photos")
      .getPublicUrl(path);
    return pub.publicUrl;
  } catch (err) {
    console.warn("ai photo generation failed", (err as Error).message);
    return null;
  }
}
