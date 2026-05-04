"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addToCart } from "@/lib/kroger/cart";
import { clearUserKrogerSession } from "@/lib/kroger/oauth";

export async function toggleGroceryItem(itemKey: string, nextChecked: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("grocery_overrides")
    .upsert(
      {
        user_id: user.id,
        item_key: itemKey,
        checked: nextChecked,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,item_key" },
    );
  revalidatePath("/shop");
}

export async function clearCheckedGroceryItems() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase
    .from("grocery_overrides")
    .delete()
    .eq("user_id", user.id)
    .eq("checked", true);
  revalidatePath("/shop");
}

// Bulk-toggle a list of grocery item keys. Used by the "Select all" /
// "Clear section" affordances on /shop.
export async function setGroceryItemsChecked(
  itemKeys: string[],
  nextChecked: boolean,
) {
  if (itemKeys.length === 0) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.from("grocery_overrides").upsert(
    itemKeys.map((k) => ({
      user_id: user.id,
      item_key: k,
      checked: nextChecked,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,item_key" },
  );
  revalidatePath("/shop");
}

// Log a single grocery trip's total. Stored in cents to avoid float drift.
export async function logGroceryPurchase(payload: {
  amountDollars: number;
  note?: string;
  purchasedAt?: string; // ISO
}) {
  if (!Number.isFinite(payload.amountDollars) || payload.amountDollars < 0) {
    return { error: "Enter a positive amount." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("grocery_purchases").insert({
    user_id: user.id,
    amount_cents: Math.round(payload.amountDollars * 100),
    note: payload.note?.trim() || null,
    purchased_at: payload.purchasedAt ?? new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath("/shop");
  revalidatePath("/stats");
  return { ok: true };
}

// Per-item payload for sendToKrogerCart. Carries the recipe quantity
// + unit so we can ask for the right number of packages — "2 cups
// flour" should add 1 small bag of flour, "20 cups flour" should add
// several. Computed by /shop's page.tsx from the merged grocery list.
export interface CartLine {
  name: string;
  qty: number;
  unit: string;
}

// Send the user's current grocery list to their Kroger cart. Pulls
// product UPCs from kroger_price_cache (populated by /shop's price
// fetch) and PUTs them via lib/kroger/cart.ts. The line's recipe qty
// + unit drives how many packages we ask Kroger to add (computed via
// lib/kroger/package-size.ts).
//
// Returns:
//   { ok: true, added: N }                        — items in cart
//   { needsAuth: true }                           — start OAuth flow
//   { error: "..." }                              — anything else
export async function sendToKrogerCart(lines: CartLine[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (lines.length === 0) {
    return { error: "Nothing to send." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_kroger_location_id")
    .eq("id", user.id)
    .maybeSingle();
  const locationId = (profile as { preferred_kroger_location_id?: string | null } | null)
    ?.preferred_kroger_location_id;
  if (!locationId) {
    return { error: "Pick a Kroger store on /me first." };
  }

  // Pull cached UPCs + size_text for each item. Anything we don't
  // have a cached match for at this store has no UPC to send.
  const queries = [...new Set(lines.map((l) => l.name.trim().toLowerCase()))];
  const { data: cacheRows } = await supabase
    .from("kroger_price_cache")
    .select("query, product_id, description, size_text")
    .eq("location_id", locationId)
    .in("query", queries);
  type CacheRow = {
    query: string;
    product_id: string | null;
    description: string | null;
    size_text: string | null;
  };
  const matchByQuery = new Map<string, CacheRow>();
  for (const row of cacheRows ?? []) {
    matchByQuery.set(row.query as string, row as CacheRow);
  }

  // Compute the right cart quantity per line. computeUnitsNeeded()
  // divides the recipe gram weight by the package gram weight; falls
  // back to 1 if either side is unparseable.
  const { computeUnitsNeeded } = await import("@/lib/kroger/package-size");
  const items = lines
    .map((line) => {
      const match = matchByQuery.get(line.name.trim().toLowerCase());
      if (!match?.product_id) return null;
      const quantity = computeUnitsNeeded({
        recipeName: line.name,
        recipeQty: line.qty,
        recipeUnit: line.unit,
        packageSizeText: match.size_text,
        productName: match.description,
      });
      return { upc: match.product_id, quantity };
    })
    .filter((x): x is { upc: string; quantity: number } => x !== null);

  if (items.length === 0) {
    return {
      error:
        "None of these items had a Kroger product match. Reload /shop to refresh prices, then try again.",
    };
  }

  const result = await addToCart({
    supabase,
    userId: user.id,
    items,
  });

  if (result.ok) {
    revalidatePath("/shop");
    return { ok: true, added: result.added ?? items.length, total: lines.length };
  }
  if (result.reason === "no-token" || result.reason === "auth") {
    // Reset any half-stale session so next attempt starts cleanly.
    if (result.reason === "auth") {
      await clearUserKrogerSession({ supabase, userId: user.id });
    }
    return { needsAuth: true as const };
  }
  return { error: `Kroger rejected the request (status ${result.status}).` };
}

export async function removeGroceryPurchase(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase
    .from("grocery_purchases")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/shop");
  revalidatePath("/stats");
  return { ok: true };
}
