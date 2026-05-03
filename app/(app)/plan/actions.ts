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
