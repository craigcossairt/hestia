// Covers the Wikimedia Commons layer of the recipe photo chain — the
// keyless replacement for the retired Brave image search.
//
// Exercised through resolveRecipePhoto() rather than the private helper so
// the tests pin the behaviour callers actually depend on. With no
// sourceUrl, no aiImageUrl, no PEXELS_API_KEY and no Supabase client, the
// chain falls straight through to Commons and stops there.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveRecipePhoto } from "./photo";

const THUMB = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Khachapuri.jpg/1200px-Khachapuri.jpg";
const ORIGINAL = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Khachapuri.jpg";

function commonsResponse(pages: unknown[]) {
  return {
    ok: true,
    json: async () => ({ query: { pages } }),
  } as unknown as Response;
}

function mockFetch(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // Guarantee the chain reaches Commons: an unset Pexels key short-circuits
  // the layer above it.
  vi.stubEnv("PEXELS_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("resolveRecipePhoto — Wikimedia Commons layer", () => {
  it("returns the bounded thumbnail, tagged as commons", async () => {
    mockFetch(
      commonsResponse([
        { index: 1, imageinfo: [{ mime: "image/jpeg", thumburl: THUMB, url: ORIGINAL }] },
      ]),
    );

    const photo = await resolveRecipePhoto({ recipeName: "khachapuri" });

    // Not the original: Commons originals are routinely 10-40MB scans.
    expect(photo).toEqual({ url: THUMB, source: "commons" });
  });

  it("falls back to the original when no thumbnail was rendered", async () => {
    mockFetch(
      commonsResponse([{ index: 1, imageinfo: [{ mime: "image/png", url: ORIGINAL }] }]),
    );

    const photo = await resolveRecipePhoto({ recipeName: "khachapuri" });

    expect(photo).toEqual({ url: ORIGINAL, source: "commons" });
  });

  it("honours the generator's relevance rank over array order", async () => {
    const best = ORIGINAL.replace("Khachapuri", "Best");
    mockFetch(
      commonsResponse([
        { index: 2, imageinfo: [{ mime: "image/jpeg", url: ORIGINAL }] },
        { index: 1, imageinfo: [{ mime: "image/jpeg", url: best }] },
      ]),
    );

    const photo = await resolveRecipePhoto({ recipeName: "khachapuri" });

    expect(photo?.url).toBe(best);
  });

  it("skips results a browser cannot render in an <img>", async () => {
    const svg = ORIGINAL.replace(".jpg", ".svg");
    mockFetch(
      commonsResponse([
        { index: 1, imageinfo: [{ mime: "image/svg+xml", url: svg }] },
        { index: 2, imageinfo: [{ mime: "image/jpeg", url: ORIGINAL }] },
      ]),
    );

    const photo = await resolveRecipePhoto({ recipeName: "khachapuri" });

    expect(photo?.url).toBe(ORIGINAL);
  });

  it("refuses a URL that is not served from the Commons upload host", async () => {
    mockFetch(
      commonsResponse([
        { index: 1, imageinfo: [{ mime: "image/jpeg", url: "https://evil.example.com/x.jpg" }] },
      ]),
    );

    expect(await resolveRecipePhoto({ recipeName: "khachapuri" })).toBeNull();
  });

  it("returns null when Commons errors, so the caller renders the SVG fallback", async () => {
    mockFetch({ ok: false, json: async () => ({}) } as unknown as Response);

    expect(await resolveRecipePhoto({ recipeName: "khachapuri" })).toBeNull();
  });

  it("returns null rather than throwing when the request fails outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    expect(await resolveRecipePhoto({ recipeName: "khachapuri" })).toBeNull();
  });

  it("searches the bare dish name and identifies itself to Wikimedia", async () => {
    const fetchMock = mockFetch(commonsResponse([]));

    await resolveRecipePhoto({
      recipeName: "khachapuri",
      // A style hint would wreck keyword recall on Commons, so the search
      // must ignore it even though AI image generation still uses it.
      promptHint: "photographed from above, shallow depth of field",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const gsrsearch = new URL(url).searchParams.get("gsrsearch");
    expect(gsrsearch).toBe("filetype:bitmap khachapuri");
    expect(gsrsearch).not.toContain("depth of field");
    expect(
      (init.headers as Record<string, string>)["User-Agent"],
    ).toMatch(/^HestiaBot\/1\.0 \(https:\/\/github\.com\//);
  });
});
