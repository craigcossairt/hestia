// Kroger product search — given a free-text ingredient + a store's
// locationId, find the cheapest reasonable matching product and return
// its price + aisle. Cached in `kroger_price_cache` (24-hour TTL).
//
// Cache strategy: keyed on (location_id, lowercased query). Misses
// store a row with null fields so we don't keep retrying unfindable
// items. Hits older than 24h are refetched in-line — we don't do
// background refresh here to keep the runtime model simple. The price
// drift from one day to the next is small enough that stale-while-
// revalidate would be overkill.

import type { SupabaseClient } from "@supabase/supabase-js";
import { krogerFetch } from "./client";

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface KrogerProductMatch {
  productId: string | null;
  description: string | null;
  priceCents: number | null; // regular shelf price
  salePriceCents: number | null; // promo / sale price if currently active
  aisleNumber: string | null;
  sizeText: string | null;
}

interface RawProductPrice {
  regular?: number;
  promo?: number;
}
interface RawProductItem {
  itemId?: string;
  size?: string;
  price?: RawProductPrice;
}
interface RawProductAisle {
  description?: string;
  number?: string;
}
interface RawProduct {
  productId: string;
  description?: string;
  brand?: string;
  items?: RawProductItem[];
  aisleLocations?: RawProductAisle[];
}
interface RawProductsResponse {
  data?: RawProduct[];
}

function dollarsToCents(d: number | undefined): number | null {
  if (d == null || !Number.isFinite(d) || d <= 0) return null;
  return Math.round(d * 100);
}

// Pick the cheapest item from a product's variants. Kroger products often
// have multiple sizes (e.g. 16oz vs 32oz of the same olive oil); we want
// the lowest-priced option for budget purposes.
function bestItem(items: RawProductItem[] | undefined): RawProductItem | null {
  if (!items?.length) return null;
  let best: RawProductItem | null = null;
  let bestCents = Infinity;
  for (const it of items) {
    const cents = dollarsToCents(it.price?.promo) ?? dollarsToCents(it.price?.regular);
    if (cents != null && cents < bestCents) {
      bestCents = cents;
      best = it;
    }
  }
  return best ?? items[0];
}

function pickProduct(
  products: RawProduct[],
): KrogerProductMatch | null {
  if (products.length === 0) return null;
  // The API already returns best-relevance first. Take the first product
  // that has a usable price; otherwise fall back to first.
  for (const p of products) {
    const item = bestItem(p.items);
    const regular = dollarsToCents(item?.price?.regular);
    const promo = dollarsToCents(item?.price?.promo);
    if (regular != null || promo != null) {
      return {
        productId: p.productId,
        description: p.description ?? null,
        priceCents: regular,
        salePriceCents: promo,
        aisleNumber: p.aisleLocations?.[0]?.number ?? null,
        sizeText: item?.size ?? null,
      };
    }
  }
  // No priced match — return the top result with nulls so callers can
  // still display a name and avoid re-querying immediately.
  const p = products[0];
  return {
    productId: p.productId,
    description: p.description ?? null,
    priceCents: null,
    salePriceCents: null,
    aisleNumber: p.aisleLocations?.[0]?.number ?? null,
    sizeText: bestItem(p.items)?.size ?? null,
  };
}

interface CacheRow {
  product_id: string | null;
  description: string | null;
  price_cents: number | null;
  sale_price_cents: number | null;
  aisle_number: string | null;
  size_text: string | null;
  fetched_at: string;
}

function rowToMatch(row: CacheRow): KrogerProductMatch {
  return {
    productId: row.product_id,
    description: row.description,
    priceCents: row.price_cents,
    salePriceCents: row.sale_price_cents,
    aisleNumber: row.aisle_number,
    sizeText: row.size_text,
  };
}

// Single-ingredient lookup. Caller should batch via lookupPricesForList
// when fetching for a whole shopping list.
async function lookupOne(args: {
  supabase: SupabaseClient;
  locationId: string;
  query: string;
  // When true, skip the cache hit-check and force a live fetch. Used
  // by the /shop "Refresh prices" button so users can bust stale
  // prices on demand without waiting for the 24h TTL.
  bypassCache?: boolean;
}): Promise<KrogerProductMatch | null> {
  const q = args.query.trim().toLowerCase();
  if (!q) return null;

  if (!args.bypassCache) {
    const { data: cached } = await args.supabase
      .from("kroger_price_cache")
      .select(
        "product_id, description, price_cents, sale_price_cents, aisle_number, size_text, fetched_at",
      )
      .eq("location_id", args.locationId)
      .eq("query", q)
      .maybeSingle();

    if (cached) {
      const fetchedAt = new Date(cached.fetched_at as string).getTime();
      if (Date.now() - fetchedAt < TTL_MS) return rowToMatch(cached as CacheRow);
    }
  }

  // Cache miss or stale — fetch from Kroger.
  const json = await krogerFetch<RawProductsResponse>({
    path: "/products",
    scope: "product.compact",
    query: {
      "filter.term": q,
      "filter.locationId": args.locationId,
      "filter.limit": 5,
    },
  });
  const match = json?.data ? pickProduct(json.data) : null;

  // Persist (even on null match — saves a future round-trip).
  await args.supabase.from("kroger_price_cache").upsert(
    {
      location_id: args.locationId,
      query: q,
      product_id: match?.productId ?? null,
      description: match?.description ?? null,
      price_cents: match?.priceCents ?? null,
      sale_price_cents: match?.salePriceCents ?? null,
      aisle_number: match?.aisleNumber ?? null,
      size_text: match?.sizeText ?? null,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "location_id,query" },
  );
  return match;
}

// Look up many ingredients in parallel. Returns a Map keyed by the
// original (lowercased) query string. Items with no Kroger match map
// to null so callers can preserve list order.
export async function lookupPricesForList(args: {
  supabase: SupabaseClient;
  locationId: string;
  queries: string[];
  // Force-refresh path: when true, every lookup ignores the cache and
  // refetches live from Kroger. Used by the /shop refresh button.
  bypassCache?: boolean;
}): Promise<Map<string, KrogerProductMatch | null>> {
  const result = new Map<string, KrogerProductMatch | null>();
  const unique = [...new Set(args.queries.map((q) => q.trim().toLowerCase()).filter(Boolean))];
  const matches = await Promise.all(
    unique.map((q) =>
      lookupOne({
        supabase: args.supabase,
        locationId: args.locationId,
        query: q,
        bypassCache: args.bypassCache,
      }),
    ),
  );
  for (let i = 0; i < unique.length; i++) {
    result.set(unique[i], matches[i]);
  }
  return result;
}
