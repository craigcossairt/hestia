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
  revalidatePath("/pantry");
  revalidatePath("/shop");
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
  revalidatePath("/pantry");
  revalidatePath("/shop");
}

export async function deletePantryItem(id: string) {
  const { supabase, user } = await getUserOrRedirect();
  await supabase.from("pantry_items").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/pantry");
  revalidatePath("/shop");
}
