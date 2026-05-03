"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Slot } from "@/lib/types/database";

async function getUserOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function setPlanSlot(args: {
  date: string; // YYYY-MM-DD
  slot: Slot;
  recipe_id: string;
}) {
  const { supabase, user } = await getUserOrRedirect();
  // Replace any existing entry for (user, date, slot).
  await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("user_id", user.id)
    .eq("date", args.date)
    .eq("slot", args.slot);

  const { error } = await supabase.from("meal_plan_entries").insert({
    user_id: user.id,
    date: args.date,
    slot: args.slot,
    recipe_id: args.recipe_id,
    status: "planned",
  });

  if (error) return { error: error.message };
  revalidatePath("/plan");
  revalidatePath("/today");
  revalidatePath("/shop");
}

export async function clearPlanSlot(entryId: string) {
  const { supabase, user } = await getUserOrRedirect();
  await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);
  revalidatePath("/plan");
  revalidatePath("/today");
  revalidatePath("/shop");
}

// Drag-and-drop: move a plan entry to a different date/slot. If the target
// already has an entry, swap the two.
export async function movePlanEntry(args: {
  fromEntryId: string;
  toDate: string;
  toSlot: Slot;
}) {
  const { supabase, user } = await getUserOrRedirect();

  const { data: from } = await supabase
    .from("meal_plan_entries")
    .select("id, date, slot, recipe_id, status")
    .eq("id", args.fromEntryId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!from) return { error: "Source not found." };

  // No-op if dropped on itself.
  if (from.date === args.toDate && from.slot === args.toSlot) return;

  const { data: to } = await supabase
    .from("meal_plan_entries")
    .select("id")
    .eq("user_id", user.id)
    .eq("date", args.toDate)
    .eq("slot", args.toSlot)
    .maybeSingle();

  // Two-phase swap to avoid the partial-uniqueness conflict if we ever add a
  // (user_id, date, slot) unique constraint later: park the source on a
  // sentinel slot, move target into source, then move source into target.
  if (to) {
    await supabase
      .from("meal_plan_entries")
      .update({ date: args.toDate, slot: args.toSlot })
      .eq("id", args.fromEntryId);
    await supabase
      .from("meal_plan_entries")
      .update({ date: from.date, slot: from.slot })
      .eq("id", to.id);
  } else {
    await supabase
      .from("meal_plan_entries")
      .update({ date: args.toDate, slot: args.toSlot })
      .eq("id", args.fromEntryId);
  }

  revalidatePath("/plan");
  revalidatePath("/today");
  revalidatePath("/shop");
}
