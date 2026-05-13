import { H, Body, Label, Btn, Card, Mono } from "@/components/ds";
import { createClient } from "@/lib/supabase/server";
import { deriveGroceryList } from "@/lib/grocery/derive";
import { GroceryRow } from "@/components/grocery/grocery-row";
import { LogPurchaseForm } from "@/components/grocery/log-purchase-form";
import { BulkActionLink } from "@/components/grocery/bulk-actions";
import { ShopRefresh } from "@/components/grocery/shop-refresh";
import { clearCheckedGroceryItems } from "./actions";
import { lookupPricesForList } from "@/lib/kroger/products";
import { getUserKrogerSession } from "@/lib/kroger/oauth";
import { computeUnitsNeeded } from "@/lib/kroger/package-size";
import { SendToCart } from "@/components/grocery/send-to-cart";
import type { Ingredient } from "@/lib/types/database";

interface ShopPageProps {
  // `fresh` is a millisecond `Date.now()` set by the Refresh-prices
  // button (see components/grocery/shop-refresh.tsx). The page parses
  // it as a number and only bypasses the Kroger price cache when the
  // value is finite, positive, NOT in the future, and at most 5
  // minutes old. Stale, future-dated, or tampered values (bookmarks,
  // hand-edited URLs, ?fresh=99999999999999) fall back to normal 24h-
  // TTL cached behavior so the cache-bypass can't be made permanent
  // by anyone sharing a /shop?fresh=… link.
  //
  // Typed as string | string[] because Next.js represents repeated
  // query keys (?fresh=a&fresh=b) as arrays — the impl takes the
  // first element.
  searchParams: Promise<{ fresh?: string | string[] }>;
}

interface GroceryPurchaseRow {
  id: string;
  amount_cents: number;
  note: string | null;
  purchased_at: string;
}

const AISLE_LABELS: Record<string, string> = {
  produce: "produce",
  protein: "protein",
  dairy: "dairy",
  bakery: "bakery",
  frozen: "frozen",
  pantry: "pantry",
  spices: "spices",
};

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const { fresh } = await searchParams;
  // Only honor `fresh` when it's a recent timestamp (< 5 minutes old)
  // AND not in the future. Without this guard:
  //  - a bookmarked or shared /shop?fresh=… URL would permanently
  //    bypass the 24h Kroger price cache (burns API quota, slow
  //    visits)
  //  - a tampered far-future timestamp (e.g. ?fresh=99999999999999)
  //    would yield a negative age and still pass any "<= TTL" check
  // The button generates a fresh Date.now() each click, so 5min is
  // plenty for the redirect to land.
  // Normalize array-shaped query (?fresh=a&fresh=b) to first value
  // before parsing.
  const FRESH_TTL_MS = 5 * 60 * 1000;
  const freshRaw = Array.isArray(fresh) ? fresh[0] : fresh;
  const freshMs = freshRaw ? Number(freshRaw) : NaN;
  const ageMs = Date.now() - freshMs;
  const bypassPriceCache =
    Number.isFinite(freshMs) &&
    freshMs > 0 &&
    ageMs >= 0 &&
    ageMs <= FRESH_TTL_MS;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="px-6 md:px-12 py-12 max-w-3xl mx-auto flex flex-col gap-4">
        <Label>this week</Label>
        <H size="xl" as="h1">
          Shop
        </H>
        <Body dim>Sign in to derive your grocery list from this week&apos;s plan.</Body>
      </div>
    );
  }

  // 7 days from today
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const toDate = new Date(today);
  toDate.setDate(today.getDate() + 7);
  const to = toDate.toISOString().slice(0, 10);

  // Span back 7 days for the "this week's spend" tally that frames the
  // log-purchase form.
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 7);

  let purchases: GroceryPurchaseRow[] = [];
  let weekTotalCents = 0;
  try {
    const { data: purchaseRows } = await supabase
      .from("grocery_purchases")
      .select("id, amount_cents, note, purchased_at")
      .eq("user_id", user.id)
      .order("purchased_at", { ascending: false })
      .limit(8);
    purchases = (purchaseRows ?? []) as GroceryPurchaseRow[];
    const sinceIso = weekStart.toISOString();
    weekTotalCents = purchases
      .filter((p) => p.purchased_at >= sinceIso)
      .reduce((a, p) => a + (p.amount_cents ?? 0), 0);
  } catch {
    // grocery_purchases table may not exist yet — silently fall back to empty
  }

  const [planRes, pantryRes, overridesRes, profileRes] = await Promise.all([
    supabase
      .from("meal_plan_entries")
      .select("recipes:recipe_id(name, ingredients_json)")
      .eq("user_id", user.id)
      .gte("date", from)
      .lt("date", to)
      .neq("status", "skipped"),
    supabase.from("pantry_items").select("name, qty, unit").eq("user_id", user.id),
    supabase
      .from("grocery_overrides")
      .select("item_key, checked")
      .eq("user_id", user.id),
    supabase
      .from("profiles")
      .select(
        "preferred_kroger_location_id, preferred_kroger_location_name, preferred_kroger_chain, never_shop_items",
      )
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const krogerLocationId =
    (profileRes.data as { preferred_kroger_location_id?: string | null } | null)
      ?.preferred_kroger_location_id ?? null;
  const krogerLocationName =
    (profileRes.data as { preferred_kroger_location_name?: string | null } | null)
      ?.preferred_kroger_location_name ?? null;
  const krogerChain =
    (profileRes.data as { preferred_kroger_chain?: string | null } | null)
      ?.preferred_kroger_chain ?? null;
  const neverShop =
    (profileRes.data as { never_shop_items?: string[] | null } | null)
      ?.never_shop_items ?? [];

  type PlanRow = { recipes: { name: string; ingredients_json: Ingredient[] } | null };
  const plan = ((planRes.data ?? []) as unknown as PlanRow[])
    .filter((r) => r.recipes != null)
    .map((r) => ({
      recipeName: r.recipes!.name,
      ingredients: r.recipes!.ingredients_json ?? [],
    }));

  const overridesMap = new Map<string, { checked: boolean }>();
  for (const o of overridesRes.data ?? []) {
    overridesMap.set(o.item_key as string, { checked: !!o.checked });
  }

  const list = deriveGroceryList({
    plan,
    pantry: pantryRes.data ?? [],
    overrides: overridesMap,
    neverShop,
  });

  // Optional: enrich the list with Kroger prices + aisles when the user
  // has picked a home store on /me. Best-effort — failures here don't
  // block the list. Cache (kroger_price_cache) absorbs repeat visits.
  type KrogerMatch = Awaited<
    ReturnType<typeof lookupPricesForList>
  > extends Map<string, infer V>
    ? V
    : never;
  const allItemNames = list.sections.flatMap((s) => s.items.map((i) => i.name));
  const emptyPriceMap: Map<string, KrogerMatch> = new Map();
  const priceMap: Map<string, KrogerMatch> = krogerLocationId
    ? await lookupPricesForList({
        supabase,
        locationId: krogerLocationId,
        queries: allItemNames,
        bypassCache: bypassPriceCache,
      }).catch(() => emptyPriceMap)
    : emptyPriceMap;

  // Estimated trip cost: sum of (package price × packages needed). The
  // packages-needed math comes from lib/kroger/package-size, which
  // divides recipe gram weight by the parsed package size. Falls back
  // to 1 when either side is unparseable, so the worst case is the
  // pre-multiplication behaviour.
  const allLines: Array<{ name: string; qty: number; unit: string }> = [];
  for (const section of list.sections) {
    for (const item of section.items) {
      allLines.push({ name: item.name, qty: item.qty, unit: item.unit });
    }
  }
  let estTotalCents = 0;
  let estCovered = 0;
  for (const line of allLines) {
    const m = priceMap.get(line.name.toLowerCase());
    if (!m) continue;
    const cents = m.salePriceCents ?? m.priceCents;
    if (cents == null) continue;
    const units = computeUnitsNeeded({
      recipeName: line.name,
      recipeQty: line.qty,
      recipeUnit: line.unit,
      packageSizeText: m.sizeText,
      productName: m.description,
    });
    estTotalCents += cents * units;
    estCovered += 1;
  }

  // Phase 2: do we have a usable Kroger user OAuth token? Drives the
  // Send-to-Cart button label (Connect vs Send). The button itself
  // does the actual auth/refresh dance — we only need to know whether
  // a token exists at all so the label reads sensibly.
  const krogerSession = krogerLocationId
    ? await getUserKrogerSession({ supabase, userId: user.id }).catch(() => null)
    : null;
  const isKrogerConnected = !!krogerSession;

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-3xl mx-auto flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Label>derived from your plan</Label>
            <H size="xl" as="h1">
              Shop
            </H>
          </div>
          <ShopRefresh withPrices={!!krogerLocationId} />
        </div>
        <Body size="lg" dim>
          {list.total} items · {list.inPantry} already in inventory
          {krogerLocationId && estCovered > 0 ? (
            <>
              {" · est. "}
              <span className="text-accent font-mono">
                ${(estTotalCents / 100).toFixed(2)}
              </span>{" "}
              <span className="font-mono text-[11px]">
                ({estCovered}/{list.total} priced)
              </span>
            </>
          ) : null}
        </Body>
        {krogerLocationName ? (
          <Body size="xs" dim>
            Prices &amp; aisles from {krogerLocationName}
          </Body>
        ) : null}
        {krogerLocationId && allLines.length > 0 ? (
          <div className="mt-2">
            <SendToCart
              lines={allLines}
              isConnected={isKrogerConnected}
              chain={krogerChain}
            />
          </div>
        ) : null}
      </header>

      {list.sections.length === 0 ? (
        <Card className="p-8 text-center">
          <Body dim>
            No groceries needed. Either nothing is planned yet, or your
            inventory covers everything.
          </Body>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap -mb-2">
            <BulkActionLink
              itemKeys={list.sections.flatMap((s) => s.items.map((i) => i.key))}
              action="check"
              className="font-mono text-[10.5px] uppercase tracking-[1.4px] text-ink-3 hover:text-ink transition-colors"
            >
              Select all
            </BulkActionLink>
            {list.checked.size > 0 ? (
              <form action={clearCheckedGroceryItems}>
                <Btn variant="ghost" size="sm" type="submit">
                  clear {list.checked.size} checked
                </Btn>
              </form>
            ) : null}
          </div>
          {list.sections.map(({ aisle, items }) => {
            const allKeys = items.map((i) => i.key);
            const allChecked = allKeys.every((k) => list.checked.has(k));
            return (
              <section key={aisle} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-3">
                    <Label>{AISLE_LABELS[aisle] ?? aisle}</Label>
                    <Mono className="text-ink-3 text-[11px]">
                      {items.length}
                    </Mono>
                  </div>
                  <BulkActionLink
                    itemKeys={allKeys}
                    action={allChecked ? "uncheck" : "check"}
                  >
                    {allChecked ? "deselect" : "select"}
                  </BulkActionLink>
                </div>
                <ul className="flex flex-col">
                  {items.map((it) => {
                    const m = priceMap.get(it.name.toLowerCase());
                    return (
                      <GroceryRow
                        key={it.key}
                        itemKey={it.key}
                        name={it.name}
                        qty={it.qty}
                        unit={it.unit}
                        fromRecipes={it.fromRecipes}
                        initialChecked={list.checked.has(it.key)}
                        priceCents={m?.priceCents ?? null}
                        salePriceCents={m?.salePriceCents ?? null}
                        aisleNumber={m?.aisleNumber ?? null}
                        productName={m?.description ?? null}
                      />
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      )}

      <LogPurchaseForm recent={purchases} weekTotalCents={weekTotalCents} />
    </div>
  );
}
