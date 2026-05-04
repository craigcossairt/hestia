// USDA FoodData Central (FDC) client. Free public API, no IP whitelist.
// Get a key at https://fdc.nal.usda.gov/api-key-signup.html and set
// USDA_API_KEY in env.
//
// Rate limit: 1,000 requests/hour per key. We add a process-scoped cache
// so a single recipe-save / plan-week run doesn't repeat lookups for the
// same ingredient ("salt" appears in 40% of recipes).
//
// Returns *per-100g* macros so callers can scale by gram weight from
// ./portion.ts. We deliberately don't trust FDC's `servingSize` because
// it's only present on Branded Foods and is wildly inconsistent.

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1";

// USDA nutrient IDs (stable across all foods).
const NUTRIENT_KCAL = 1008; // Energy, kcal
const NUTRIENT_PROTEIN = 1003; // Protein (g)
const NUTRIENT_CARBS = 1005; // Carbohydrate, by difference (g)
const NUTRIENT_FAT = 1004; // Total lipid (fat) (g)

export interface FdcMacrosPer100g {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FdcLookupResult {
  fdcId: number;
  description: string;
  dataType: string; // "Foundation" | "SR Legacy" | "Survey (FNDDS)" | "Branded"
  per100g: FdcMacrosPer100g;
}

// Module-scoped cache. Key is the lowercased query string. Lives for the
// life of the Node process — Vercel Functions reuse instances under Fluid
// Compute, so within a single regenerate we avoid 21*N redundant calls.
const cache = new Map<string, FdcLookupResult | null>();

// Promise cache: when two ingredients fire the same lookup concurrently
// (parallel plan-week save), we want them to share a single in-flight
// request rather than racing.
const inflight = new Map<string, Promise<FdcLookupResult | null>>();

interface FdcSearchFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients?: Array<{ nutrientId?: number; value?: number }>;
}

function getApiKey(): string | null {
  const k = process.env.USDA_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

// Pull our four macro values out of FDC's foodNutrients array. Returns
// null if the food has no kcal data — those records are essentially
// unusable for our purposes.
function extractMacros(
  food: FdcSearchFood,
): FdcMacrosPer100g | null {
  const nutrients = food.foodNutrients ?? [];
  let kcal: number | null = null;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const n of nutrients) {
    const id = n.nutrientId;
    const v = n.value ?? 0;
    if (id === NUTRIENT_KCAL) kcal = v;
    else if (id === NUTRIENT_PROTEIN) protein = v;
    else if (id === NUTRIENT_CARBS) carbs = v;
    else if (id === NUTRIENT_FAT) fat = v;
  }
  if (kcal == null || kcal <= 0) return null;
  return { kcal, protein, carbs, fat };
}

// Score a candidate food. We prefer Foundation > SR Legacy > Survey >
// Branded — the curated USDA datasets are more accurate per-100g than
// branded barcodes. Among matching dataTypes, the API already returns
// best-match-first, so first-with-macros wins.
const DATATYPE_RANK: Record<string, number> = {
  Foundation: 4,
  "SR Legacy": 3,
  "Survey (FNDDS)": 2,
  Branded: 1,
};

function pickBest(foods: FdcSearchFood[]): FdcLookupResult | null {
  let best: { food: FdcSearchFood; macros: FdcMacrosPer100g; rank: number } | null = null;
  for (const f of foods) {
    const macros = extractMacros(f);
    if (!macros) continue;
    const rank = DATATYPE_RANK[f.dataType] ?? 0;
    if (!best || rank > best.rank) best = { food: f, macros, rank };
  }
  if (!best) return null;
  return {
    fdcId: best.food.fdcId,
    description: best.food.description,
    dataType: best.food.dataType,
    per100g: best.macros,
  };
}

// Find the best FDC match for a free-text ingredient name. Returns null
// when FDC has no usable record (or USDA_API_KEY is unset).
//
// Rough conventions for callers:
//   - Pass the normalised name (e.g. "chicken breast", not "boneless,
//     skinless chicken breast (organic, free-range)") for higher hit rate.
//   - Spices and tiny-quantity flavorings can be skipped — their macro
//     contribution is negligible and FDC's spice records are noisy.
export async function lookupFood(
  query: string,
): Promise<FdcLookupResult | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;

  const apiKey = getApiKey();
  if (!apiKey) {
    cache.set(key, null);
    return null;
  }

  const promise = (async () => {
    try {
      const url = new URL(`${FDC_BASE}/foods/search`);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("query", key);
      url.searchParams.set("pageSize", "5");
      // Skip Branded by default — accuracy is too variable. We'll fall
      // through to it implicitly only if no curated match exists, but
      // the search endpoint doesn't accept exclusion, so just take 5
      // and let pickBest sort it out.
      url.searchParams.set(
        "dataType",
        "Foundation,SR Legacy,Survey (FNDDS),Branded",
      );

      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        // 429 = rate-limited. Don't cache the null so retries can succeed.
        if (res.status === 429) return null;
        cache.set(key, null);
        return null;
      }
      const json = (await res.json()) as { foods?: FdcSearchFood[] };
      const result = pickBest(json.foods ?? []);
      cache.set(key, result);
      return result;
    } catch {
      // Network/timeout failures: don't cache so a later retry can succeed.
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

// Test seam — exposed for unit tests / dev tools, not for app code.
export function _resetFdcCache(): void {
  cache.clear();
  inflight.clear();
}
