"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProgram } from "@/lib/programs";

export async function activateProgram(id: string) {
  const program = getProgram(id);
  if (!program) return { error: "Unknown program." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({
      active_program: id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/programs");
  revalidatePath("/today");
  revalidatePath("/coach");
}

export async function deactivateProgram() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("profiles")
    .update({
      active_program: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  revalidatePath("/programs");
  revalidatePath("/today");
  revalidatePath("/coach");
}
