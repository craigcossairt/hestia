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

  const { error: delErr } = await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("user_id", user.id)
    .eq("date", args.date)
    .eq("slot", args.slot);
  if (delErr) return { error: delErr.message };

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
  const { error } = await supabase
    .from("meal_plan_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/plan");
  revalidatePath("/today");
  revalidatePath("/shop");
}

// Drag-and-drop: move a plan entry to a different date/slot. If the target
// already has an entry, swap via the atomic RPC (three-phase park) so we
// never trip UNIQUE (user_id, date, slot).
export async function movePlanEntry(args: {
  fromEntryId: string;
  toDate: string;
  toSlot: Slot;
}) {
  const { supabase, user } = await getUserOrRedirect();

  const { data: from } = await supabase
    .from("meal_plan_entries")
    .select("id, date, slot")
    .eq("id", args.fromEntryId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!from) return { error: "Source not found." };

  if (from.date === args.toDate && from.slot === args.toSlot) return;

  const { error } = await supabase.rpc("swap_or_move_meal_plan_entry", {
    p_from_id: args.fromEntryId,
    p_to_date: args.toDate,
    p_to_slot: args.toSlot,
  });

  if (error) {
    // Only fall back when the RPC is missing (pre-migration 0023). Other
    // failures (RLS, deadlock, uniqueness) must surface — the unlocked JS
    // path reintroduces the race the RPC exists to prevent.
    const code = (error as { code?: string }).code;
    if (code !== "PGRST202") {
      return { error: error.message };
    }

    const parkDate = "1900-01-01";
    const { data: to } = await supabase
      .from("meal_plan_entries")
      .select("id")
      .eq("user_id", user.id)
      .eq("date", args.toDate)
      .eq("slot", args.toSlot)
      .maybeSingle();

    if (to) {
      const { error: e1 } = await supabase
        .from("meal_plan_entries")
        .update({ date: parkDate, slot: from.slot })
        .eq("id", args.fromEntryId)
        .eq("user_id", user.id);
      if (e1) return { error: e1.message };

      const { error: e2 } = await supabase
        .from("meal_plan_entries")
        .update({ date: from.date, slot: from.slot })
        .eq("id", to.id)
        .eq("user_id", user.id);
      if (e2) {
        await supabase
          .from("meal_plan_entries")
          .update({ date: from.date, slot: from.slot })
          .eq("id", args.fromEntryId)
          .eq("user_id", user.id);
        return { error: e2.message };
      }

      const { error: e3 } = await supabase
        .from("meal_plan_entries")
        .update({ date: args.toDate, slot: args.toSlot })
        .eq("id", args.fromEntryId)
        .eq("user_id", user.id);
      if (e3) return { error: e3.message };
    } else {
      const { error: moveErr } = await supabase
        .from("meal_plan_entries")
        .update({ date: args.toDate, slot: args.toSlot })
        .eq("id", args.fromEntryId)
        .eq("user_id", user.id);
      if (moveErr) return { error: moveErr.message };
    }
  }

  revalidatePath("/plan");
  revalidatePath("/today");
  revalidatePath("/shop");
}
