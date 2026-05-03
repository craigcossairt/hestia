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
