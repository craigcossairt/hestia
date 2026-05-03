import type { Ingredient, PantryItem } from "@/lib/types/database";

export type Aisle =
  | "produce"
  | "protein"
  | "dairy"
  | "pantry"
  | "frozen"
  | "spices"
  | "bakery";

export const AISLE_ORDER: Aisle[] = [
  "produce",
  "protein",
  "dairy",
  "bakery",
  "frozen",
  "pantry",
  "spices",
];

export interface GroceryItem {
  key: string;
  name: string;
  qty: number;
  unit: string;
  aisle: Aisle;
  fromRecipes: string[];
}

export interface DerivedGroceryList {
  sections: Array<{ aisle: Aisle; items: GroceryItem[] }>;
  total: number;
  inPantry: number;
}

interface PlanRowForDerive {
  recipeName: string;
  ingredients: Ingredient[];
}

function classifyAisle(ing: Ingredient): Aisle {
  if (ing.aisle && (AISLE_ORDER as string[]).includes(ing.aisle))
    return ing.aisle as Aisle;
  const n = ing.name.toLowerCase();
  if (/(spinach|kale|tomato|onion|garlic|carrot|pepper|lettuce|cucumber|berr|apple|banana|lemon|lime|broccoli|zucchini|mushroom|avocado|herb|cilantro|parsley)/.test(n))
    return "produce";
  if (/(chicken|beef|pork|turkey|salmon|tuna|shrimp|fish|tofu|tempeh|egg|sausage|bacon)/.test(n))
    return "protein";
  if (/(milk|yogurt|cheese|butter|cream|kefir|cottage)/.test(n)) return "dairy";
  if (/(frozen|ice cream|peas)/.test(n)) return "frozen";
  if (/(bread|tortilla|bun|bagel|pita)/.test(n)) return "bakery";
  if (/(salt|pepper|cumin|paprika|cinnamon|oregano|thyme|basil|chili|powder|spice|seasoning|garlic powder|onion powder|nutmeg|turmeric)/.test(n))
    return "spices";
  return "pantry";
}

function normaliseUnit(u: string): string {
  return u.trim().toLowerCase().replace(/s$/, "");
}

export function deriveGroceryList(args: {
  plan: PlanRowForDerive[];
  pantry: Pick<PantryItem, "name" | "qty" | "unit">[];
  overrides: Map<string, { checked: boolean }>;
}): DerivedGroceryList & { checked: Set<string> } {
  // Aggregate (name + unit) across all planned recipes.
  const map = new Map<string, GroceryItem>();
  for (const row of args.plan) {
    for (const ing of row.ingredients) {
      const unit = normaliseUnit(ing.unit);
      const key = `${ing.name.toLowerCase()}|${unit}`;
      const existing = map.get(key);
      const aisle = classifyAisle(ing);
      if (existing) {
        existing.qty += ing.qty;
        if (!existing.fromRecipes.includes(row.recipeName))
          existing.fromRecipes.push(row.recipeName);
      } else {
        map.set(key, {
          key: `${aisle}:${key}`,
          name: ing.name,
          qty: ing.qty,
          unit: ing.unit,
          aisle,
          fromRecipes: [row.recipeName],
        });
      }
    }
  }

  // Subtract pantry quantities when units match.
  const pantryByKey = new Map<string, number>();
  for (const p of args.pantry) {
    const k = `${p.name.toLowerCase()}|${normaliseUnit(p.unit)}`;
    pantryByKey.set(k, (pantryByKey.get(k) ?? 0) + p.qty);
  }
  let inPantry = 0;
  for (const item of map.values()) {
    const key = `${item.name.toLowerCase()}|${normaliseUnit(item.unit)}`;
    const have = pantryByKey.get(key) ?? 0;
    if (have >= item.qty) {
      inPantry++;
      map.delete(key);
    } else if (have > 0) {
      item.qty = Math.max(0, item.qty - have);
    }
  }

  // Group by aisle, sort sections.
  const grouped = new Map<Aisle, GroceryItem[]>();
  for (const item of map.values()) {
    const arr = grouped.get(item.aisle) ?? [];
    arr.push(item);
    grouped.set(item.aisle, arr);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }

  const sections = AISLE_ORDER.filter((a) => grouped.has(a)).map((aisle) => ({
    aisle,
    items: grouped.get(aisle)!,
  }));

  const checked = new Set<string>();
  for (const [k, v] of args.overrides) {
    if (v.checked) checked.add(k);
  }

  return {
    sections,
    total: map.size,
    inPantry,
    checked,
  };
}
