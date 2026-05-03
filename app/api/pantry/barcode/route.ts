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
      return NextResponse.json({ found: false }, { status: 404 });
    }
    const p = json.product;
    const name = p.product_name_en ?? p.product_name ?? "unknown product";
    const tags = p.categories_tags ?? [];
    let location: "pantry" | "fridge" | "freezer" | "spices" = "pantry";
    if (tags.some((t) => /frozen/i.test(t))) location = "freezer";
    else if (tags.some((t) => /(dairy|cheese|yogurt|milk|egg|fresh)/i.test(t)))
      location = "fridge";
    else if (tags.some((t) => /(spice|herb|seasoning)/i.test(t))) location = "spices";

    return NextResponse.json({
      found: true,
      name: name.toLowerCase(),
      brand: p.brands ?? null,
      quantity_text: p.quantity ?? null,
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
