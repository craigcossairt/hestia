// Recipe photo resolver. Tries the cheapest, most reliable source first
// and falls back through several layers — every layer is best-effort and
// returns null on failure so callers can handle "no photo" gracefully.
//
// Order:
//   1. og:image extraction — when a recipe was parsed from a webpage,
//      the page's own marketing image is the gold standard.
//   2. AI image generation — if the configured provider has an image
//      model (xai grok-2-image, openai dall-e, google imagen).
//   3. Pexels search — free, fast, generous tier. Set PEXELS_API_KEY.
//   4. null — caller should render a FoodImage SVG fallback.

import { experimental_generateImage } from "ai";
import { getImageModel } from "./provider";

export interface ResolvedPhoto {
  url: string;
  source: "og" | "ai" | "pexels";
}

export async function resolveRecipePhoto(args: {
  recipeName: string;
  sourceUrl?: string | null;
  // Short cuisine / style hint for the image-gen prompt
  // (e.g. "creamy pasta dish, Italian, photographed from above").
  promptHint?: string;
}): Promise<ResolvedPhoto | null> {
  const { recipeName, sourceUrl, promptHint } = args;

  // 1. Source page og:image
  if (sourceUrl) {
    const og = await tryExtractOgImage(sourceUrl);
    if (og) return { url: og, source: "og" };
  }

  // 2. AI image generation
  const ai = await tryGenerateAiPhoto(recipeName, promptHint);
  if (ai) return { url: ai, source: "ai" };

  // 3. Pexels search
  const pex = await tryPexelsSearch(recipeName);
  if (pex) return { url: pex, source: "pexels" };

  return null;
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
    // Image SDK returns either a base64 string or { base64, mimeType }
    const base64 = (image as { base64?: string; mimeType?: string }).base64
      ?? (typeof image === "string" ? image : null);
    if (!base64) return null;
    const mime =
      (image as { mimeType?: string }).mimeType ?? "image/png";
    return `data:${mime};base64,${base64}`;
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
