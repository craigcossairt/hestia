"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
