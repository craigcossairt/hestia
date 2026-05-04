"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PantryLocation, PantrySource } from "@/lib/types/database";

async function getUserOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function bumpRevalidations() {
  revalidatePath("/inventory");
  revalidatePath("/shop");
  revalidatePath("/today");
}

export async function addPantryItem(item: {
  name: string;
  qty?: number;
  unit?: string;
  location?: PantryLocation;
  source?: PantrySource;
  expires_at?: string | null;
  photo_url?: string | null;
}) {
  const { supabase, user } = await getUserOrRedirect();
  const { error } = await supabase.from("pantry_items").insert({
    user_id: user.id,
    name: item.name.toLowerCase().trim(),
    qty: item.qty ?? 1,
    unit: item.unit ?? "each",
    location: item.location ?? "pantry",
    source: item.source ?? "manual",
    expires_at: item.expires_at ?? null,
    photo_url: item.photo_url ?? null,
  });
  if (error) return { error: error.message };
  bumpRevalidations();
}

// Quick-add path: if an item with the same name+unit+location already exists,
// bump its quantity instead of inserting a duplicate row. Falls back to
// addPantryItem when no match.
export async function addOrIncrementPantryItem(item: {
  name: string;
  qty: number;
  unit: string;
  location: PantryLocation;
  source?: PantrySource;
  // Set on insert. On update we preserve the existing row's photo
  // (incrementing qty shouldn't change the saved image) so re-scanning
  // an item never overwrites a photo the user might have manually
  // updated later.
  photo_url?: string | null;
}) {
  const { supabase, user } = await getUserOrRedirect();
  const normalizedName = item.name.toLowerCase().trim();

  const { data: existing } = await supabase
    .from("pantry_items")
    .select("id, qty")
    .eq("user_id", user.id)
    .eq("name", normalizedName)
    .eq("unit", item.unit)
    .eq("location", item.location)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("pantry_items")
      .update({ qty: (existing.qty ?? 0) + item.qty })
      .eq("id", existing.id)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("pantry_items").insert({
      user_id: user.id,
      name: normalizedName,
      qty: item.qty,
      unit: item.unit,
      location: item.location,
      source: item.source ?? "manual",
      photo_url: item.photo_url ?? null,
    });
    if (error) return { error: error.message };
  }

  bumpRevalidations();
}

export async function bulkAddPantryItems(
  items: Array<{
    name: string;
    qty: number;
    unit: string;
    location: PantryLocation;
  }>,
  source: PantrySource = "bulk",
) {
  if (items.length === 0) return;
  const { supabase, user } = await getUserOrRedirect();
  const { error } = await supabase.from("pantry_items").insert(
    items.map((i) => ({
      user_id: user.id,
      name: i.name.toLowerCase().trim(),
      qty: i.qty,
      unit: i.unit,
      location: i.location,
      source,
    })),
  );
  if (error) return { error: error.message };
  bumpRevalidations();
}

export async function deletePantryItem(id: string) {
  const { supabase, user } = await getUserOrRedirect();
  await supabase.from("pantry_items").delete().eq("id", id).eq("user_id", user.id);
  bumpRevalidations();
}

export async function updatePantryQty(id: string, qty: number) {
  if (qty < 0) return { error: "Quantity must be ≥ 0." };
  const { supabase, user } = await getUserOrRedirect();
  if (qty === 0) {
    // Auto-cleanup: a zeroed item is just gone.
    const { error } = await supabase
      .from("pantry_items")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("pantry_items")
      .update({ qty })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
  }
  bumpRevalidations();
}

// Subtract recipe ingredients from matching pantry items. Best-effort:
// fuzzy substring match on name, only decrement when the unit matches.
// Mismatches are silently skipped (they'll surface on the shopping list).
export async function decrementInventoryFromIngredients(
  ingredients: Array<{ name: string; qty: number; unit: string }>,
) {
  if (!ingredients?.length) return { matched: 0 };
  const { supabase, user } = await getUserOrRedirect();
  const { data: items } = await supabase
    .from("pantry_items")
    .select("id, name, qty, unit")
    .eq("user_id", user.id);
  if (!items?.length) return { matched: 0 };

  let matched = 0;
  for (const ing of ingredients) {
    const ingName = ing.name.toLowerCase().trim();
    if (!ingName) continue;
    // Prefer the most specific match (longest name overlap).
    const candidate = items
      .filter(
        (it) =>
          it.unit === ing.unit &&
          (it.name.includes(ingName) || ingName.includes(it.name)),
      )
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (!candidate) continue;
    const nextQty = (candidate.qty ?? 0) - ing.qty;
    if (nextQty <= 0) {
      await supabase.from("pantry_items").delete().eq("id", candidate.id);
    } else {
      await supabase
        .from("pantry_items")
        .update({ qty: nextQty })
        .eq("id", candidate.id);
    }
    matched++;
  }
  bumpRevalidations();
  return { matched };
}
