"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function dismissInsight(id: string) {
  const supabase = await createClient();
  await supabase
    .from("insights")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/today");
}
