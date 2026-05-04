import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const Query = z.object({ code: z.string().min(6).max(20) });

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  image_thumb_url?: string;
  categories_tags?: string[];
}

// Parse Open Food Facts' free-text `quantity` field ("1 L", "13 oz",
// "1 gal", "453 g", "12 ct", "2 lb 4 oz") into a single qty+unit pair
// the pantry can use as a sensible default. The user can still override
// in the preview card before confirming.
//
// Returns null when the text is empty or unparseable — caller falls
// back to qty=1, unit="each".
function parseOffQuantity(text: string | undefined | null): {
  qty: number;
  unit: string;
} | null {
  if (!text) return null;
  const cleaned = text
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // strip parenthetical "(2 × 500 g)" etc.
    .replace(/\s+/g, " ")
    .trim();

  // Common abbreviation normalisations BEFORE regex match.
  const normalized = cleaned
    .replace(/\bfluid\s+(ounce|ounces|oz)\b/g, "fl oz")
    .replace(/\b(ounce|ounces)\b/g, "oz")
    .replace(/\b(pound|pounds|lbs)\b/g, "lb")
    .replace(/\b(gallon|gallons|gal)\b/g, "gal")
    .replace(/\b(liter|liters|litre|litres|ltr)\b/g, "l")
    .replace(/\b(milliliter|milliliters|mls?)\b/g, "ml")
    .replace(/\b(gram|grams|gr|grm)\b/g, "g")
    .replace(/\b(kilogram|kilograms|kgs)\b/g, "kg")
    .replace(/\b(count|ct|each|ea|piece|pieces|pcs?)\b/g, "ct");

  // Match leading number (incl. "1.5", "1/2", ".5") then unit text.
  // "fl oz" is two words — handled by the alternation in the unit group.
  const m = normalized.match(
    /^(\d+(?:[./]\d+)?|\.\d+)\s*(fl oz|ml|kg|gal|each|ct|lb|oz|g|l)\b/,
  );
  if (!m) return null;
  let qty = parseFloat(m[1]);
  if (m[1].includes("/")) {
    const [a, b] = m[1].split("/").map(Number);
    if (b > 0) qty = a / b;
  }
  if (!Number.isFinite(qty) || qty <= 0) return null;

  // Map to the pantry's canonical unit names. "ct" / "each" both
  // collapse to "each" for consistency with the manual quick-add path.
  let unit = m[2];
  if (unit === "ct") unit = "each";
  if (unit === "gal") unit = "gallon"; // pantry dropdown uses long form

  return { qty, unit };
}

// Open Food Facts is free + no key required.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = Query.safeParse({ code: searchParams.get("code") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }
  const { code } = parsed.data;

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,brands,quantity,image_thumb_url,categories_tags`,
      {
        headers: { "User-Agent": "Hestia/0.1 (personal use)" },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Lookup failed" }, { status: 502 });
    }
    const json = (await res.json()) as { status: number; product?: OffProduct };
    if (json.status !== 1 || !json.product) {
      return NextResponse.json({ found: false, code }, { status: 404 });
    }
    const p = json.product;
    const name = p.product_name_en ?? p.product_name ?? "unknown product";
    const tags = p.categories_tags ?? [];

    // Auto-pick a location from category tags. Heuristic — user can
    // override in the preview card. Fridge/freezer/spices win over
    // "pantry" (the default) when any matching tag is present.
    let location: "pantry" | "fridge" | "freezer" | "spices" = "pantry";
    if (tags.some((t) => /frozen/i.test(t))) {
      location = "freezer";
    } else if (
      // Broader dairy match — "en:dairies" plural doesn't include the
      // substring "dairy", so we accept the prefix "dairi" too.
      tags.some((t) =>
        /(dairi|dairy|cheese|yogurt|yoghurt|milk|butter|cream|egg|fresh-meat|fresh-fish|seafood|deli|charcuterie|vegetable|fruit)/i.test(t),
      )
    ) {
      location = "fridge";
    } else if (tags.some((t) => /(spice|herb|seasoning|salt|pepper)/i.test(t))) {
      location = "spices";
    }

    const parsedQty = parseOffQuantity(p.quantity);

    return NextResponse.json({
      found: true,
      code,
      name: name.toLowerCase(),
      brand: p.brands ?? null,
      quantity_text: p.quantity ?? null,
      // Default qty + unit: parsed from OFF quantity if possible, else
      // a single unit (the user can change it).
      qty: parsedQty?.qty ?? 1,
      unit: parsedQty?.unit ?? "each",
      photo_url: p.image_thumb_url ?? null,
      location,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Fetch failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
