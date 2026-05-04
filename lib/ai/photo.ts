// Recipe photo resolver. Tries the cheapest, most reliable source first
// and falls back through several layers — every layer is best-effort and
// returns null on failure so callers can handle "no photo" gracefully.
//
// Order:
//   0. AI-provided image URL — when the model has live search enabled
//      (e.g. Grok), it can return a representative real-photo URL with
//      the recipe. Skipping this would mean paying for two searches
//      (the AI's + ours) for the same recipe.
//   1. og:image extraction — when a recipe was parsed from a webpage,
//      the page's own marketing image is the gold standard.
//   2. Web image search (Brave Search API; env-gated) — broad coverage,
//      good for niche dishes where Pexels has nothing.
//   3. Pexels search — fast, free, generous tier; great for common foods.
//   4. AI image generation — most expensive, slowest; used as a creative
//      fallback when search fails.
//   5. null — caller renders a FoodImage SVG fallback.

import { experimental_generateImage } from "ai";
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
}): Promise<ResolvedPhoto | null> {
  const { recipeName, sourceUrl, aiImageUrl, promptHint } = args;

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

  // 2. Web image search
  const web = await tryWebImageSearch(recipeName, promptHint);
  if (web) return { url: web, source: "web" };

  // 3. Pexels
  const pex = await tryPexelsSearch(recipeName);
  if (pex) return { url: pex, source: "pexels" };

  // 4. AI image generation
  const ai = await tryGenerateAiPhoto(recipeName, promptHint);
  if (ai) return { url: ai, source: "ai_gen" };

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

// Returns a data: URL or remote URL for the generated image. Generated
// images are returned as base64 by most providers; we encode as data: URL
// so the client can render directly without a CDN.
async function tryGenerateAiPhoto(
  name: string,
  hint?: string,
): Promise<string | null> {
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
    const base64 = (image as { base64?: string; mimeType?: string }).base64
      ?? (typeof image === "string" ? image : null);
    if (!base64) return null;
    const mime = (image as { mimeType?: string }).mimeType ?? "image/png";
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}
