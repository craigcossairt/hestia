import { H, Body, Label, Btn, Card, Mono } from "@/components/ds";
import { createClient } from "@/lib/supabase/server";
import { deriveGroceryList } from "@/lib/grocery/derive";
import { GroceryRow } from "@/components/grocery/grocery-row";
import { LogPurchaseForm } from "@/components/grocery/log-purchase-form";
import { BulkActionLink } from "@/components/grocery/bulk-actions";
import { clearCheckedGroceryItems } from "./actions";
import type { Ingredient } from "@/lib/types/database";

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

export default async function ShopPage() {
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

  const [planRes, pantryRes, overridesRes] = await Promise.all([
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
  ]);

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
  });

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-3xl mx-auto flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Label>derived from your plan</Label>
        <H size="xl" as="h1">
          Shop
        </H>
        <Body size="lg" dim>
          {list.total} items · {list.inPantry} already in inventory
        </Body>
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
                  {items.map((it) => (
                    <GroceryRow
                      key={it.key}
                      itemKey={it.key}
                      name={it.name}
                      qty={it.qty}
                      unit={it.unit}
                      fromRecipes={it.fromRecipes}
                      initialChecked={list.checked.has(it.key)}
                    />
                  ))}
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
