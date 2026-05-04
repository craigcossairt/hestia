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

// Send the user's current grocery list to their Kroger cart. Pulls
// product UPCs from kroger_price_cache (populated by /shop's price
// fetch) and PUTs them via lib/kroger/cart.ts.
//
// Returns:
//   { ok: true, added: N }                        — items in cart
//   { needsAuth: true }                           — start OAuth flow
//   { error: "..." }                              — anything else
export async function sendToKrogerCart(itemNames: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (itemNames.length === 0) {
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

  // Pull cached UPCs for each item. Anything we don't have a cached
  // price for at this store has no UPC to send.
  const queries = [...new Set(itemNames.map((n) => n.trim().toLowerCase()))];
  const { data: cacheRows } = await supabase
    .from("kroger_price_cache")
    .select("query, product_id")
    .eq("location_id", locationId)
    .in("query", queries);
  const upcByQuery = new Map<string, string>();
  for (const row of cacheRows ?? []) {
    if (row.product_id) upcByQuery.set(row.query as string, row.product_id as string);
  }

  // One cart entry per matched ingredient. Quantity is 1 per
  // ingredient in this first pass — we don't yet do unit math (e.g.
  // "2 cups of flour" → "2 of the smallest flour bag"). The user can
  // adjust quantities in the Kroger cart before checkout.
  const items = itemNames
    .map((name) => {
      const upc = upcByQuery.get(name.trim().toLowerCase());
      return upc ? { upc, quantity: 1 } : null;
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
    return { ok: true, added: result.added ?? items.length, total: itemNames.length };
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
