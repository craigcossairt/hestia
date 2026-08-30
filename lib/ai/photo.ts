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
//   2. Pexels search — free with a generous tier (~200 req/hour) and the
//      better-looking result for everyday dishes, which is most of them.
//   3. Wikimedia Commons image search — free, keyless, and unusually good
//      at the niche/regional dish names Pexels' stock library misses
//      ("khachapuri", "cochinita pibil"). Fallback only, because the
//      photos are amateur-quality more often than Pexels'.
//   4. AI image generation — slowest + most expensive; creative
//      fallback when search misses.
//   5. null — caller renders a FoodImage SVG fallback.

import { experimental_generateImage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getImageModel } from "./provider";
import { assertSafeFetchUrl, fetchWithSafeRedirects } from "@/lib/net/safe-url";

export interface ResolvedPhoto {
  url: string;
  source: "ai_search" | "og" | "commons" | "pexels" | "ai_gen";
}

export async function resolveRecipePhoto(args: {
  recipeName: string;
  sourceUrl?: string | null;
  // URL the AI returned alongside the recipe (likely from its own web
  // search). When present and points at a real image, we use it directly
  // instead of running another search.
  aiImageUrl?: string | null;
  // Short cuisine / style hint for AI image generation (e.g. "creamy
  // pasta dish, Italian, photographed from above"). Not fed to the
  // Commons search — see tryCommonsImageSearch for why.
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

  // 2. Pexels (free, generous quota, best-looking for everyday dishes).
  const pex = await tryPexelsSearch(recipeName);
  if (pex) return { url: pex, source: "pexels" };

  // 3. Wikimedia Commons (free + keyless, better at niche/specific names).
  const commons = await tryCommonsImageSearch(recipeName);
  if (commons) return { url: commons, source: "commons" };

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
  try {
    const fetched = await fetchWithSafeRedirects(url, {
      method: "HEAD",
      headers: { "User-Agent": "HestiaBot/1.0" },
      timeoutMs: 4000,
      maxRedirects: 3,
    });
    if (!fetched.ok) {
      // HEAD may be blocked — fall back to extension sniff after SSRF check.
      const safe = await assertSafeFetchUrl(url);
      if (!safe.ok) return null;
      if (/\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(safe.url.pathname)) {
        return safe.url.toString();
      }
      return null;
    }
    if (!fetched.response.ok) return null;
    const ct = fetched.response.headers.get("content-type") ?? "";
    if (ct.startsWith("image/")) return fetched.finalUrl.toString();
    return null;
  } catch {
    return null;
  }
}

// Lightweight og:image extractor. Avoids pulling in a full HTML parser —
// regex is fine for the meta tag.
async function tryExtractOgImage(url: string): Promise<string | null> {
  try {
    const fetched = await fetchWithSafeRedirects(url, {
      headers: {
        "User-Agent": "HestiaBot/1.0 (recipe photo extractor)",
      },
      timeoutMs: 6000,
      maxRedirects: 3,
    });
    if (!fetched.ok || !fetched.response.ok) return null;
    const html = await fetched.response.text();
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
    let absolute: string;
    if (!/^https?:\/\//.test(candidate)) {
      try {
        absolute = new URL(candidate, fetched.finalUrl).toString();
      } catch {
        return null;
      }
    } else {
      absolute = candidate;
    }
    // Re-validate the image URL itself (may be on a CDN host).
    return validateImageUrl(absolute);
  } catch {
    return null;
  }
}

// Shape of the MediaWiki action API response with formatversion=2, where
// `query.pages` is an array (the legacy default keys it by page id).
interface CommonsSearchResponse {
  query?: {
    pages?: Array<{
      // Generator result ordering. The API does not guarantee `pages`
      // comes back in search-relevance order, but every generated page
      // carries its rank here, so we sort on it.
      index?: number;
      imageinfo?: Array<{
        url?: string;
        thumburl?: string;
        mime?: string;
      }>;
    }>;
  };
}

// Wikimedia insists on a descriptive, contactable User-Agent for API
// traffic; generic agents get throttled or blocked outright.
const COMMONS_USER_AGENT =
  "HestiaBot/1.0 (https://github.com/craigcossairt/hestia; recipe photo lookup)";

// Bounds the thumbnail we ask for. Commons originals are frequently
// 10–40 MB scans; a 1200px-wide thumb is plenty for a recipe card and
// keeps the stored URL cheap to serve.
const COMMONS_THUMB_WIDTH = 1200;

// Only these render reliably in an <img> across browsers. The
// `filetype:bitmap` search qualifier already filters out SVG/PDF/video,
// but the mime check is the one that actually guarantees it.
const COMMONS_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

// Wikimedia Commons image search. Free, keyless, no account and no card —
// which is the whole reason it sits here: it replaced Brave's image API
// after Brave retired its free tier. Commons is also a better fit for this
// slot than a general web-image index, because its strength is exactly
// what we fall back for: specific, named, regional dishes.
//
// Deliberately searches the bare dish name. Commons search is keyword
// matching over file captions and categories, not a semantic web index,
// so appending the AI's style hint ("photographed from above, shallow
// depth of field") drops recall to near zero rather than refining it.
async function tryCommonsImageSearch(query: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      generator: "search",
      // Namespace 6 is File:. `filetype:bitmap` keeps out SVG diagrams,
      // PDFs and video, which Commons returns freely for food terms.
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: "6",
      gsrlimit: "8",
      prop: "imageinfo",
      iiprop: "url|mime",
      iiurlwidth: String(COMMONS_THUMB_WIDTH),
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let res: Response;
    try {
      res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": COMMONS_USER_AGENT,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return null;
    const json = (await res.json()) as CommonsSearchResponse;
    const rank = (p: { index?: number }) => p.index ?? Number.MAX_SAFE_INTEGER;
    const pages = [...(json.query?.pages ?? [])].sort(
      (a, b) => rank(a) - rank(b),
    );
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      if (info.mime && !COMMONS_ALLOWED_MIME.has(info.mime)) continue;
      // Prefer the bounded thumbnail; the original is the fallback only
      // when the thumbnailer declined to render one.
      const url = info.thumburl ?? info.url;
      if (url && isCommonsUploadUrl(url)) return url;
    }
    return null;
  } catch {
    return null;
  }
}

// Commons serves every file from upload.wikimedia.org. Pinning the host
// means the URL we hand back can't be steered somewhere else by the API
// response, so this layer needs no separate SSRF re-validation.
function isCommonsUploadUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "upload.wikimedia.org";
  } catch {
    return false;
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
