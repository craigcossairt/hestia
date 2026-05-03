"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Send an OTP code (NOT a magic link). Skipping emailRedirectTo tells Supabase
// to email a 6-digit code instead. Avoids PKCE/cookie/redirect complexity that
// breaks the magic-link flow on Next.js App Router.
export async function sendOtp(_prev: unknown, formData: FormData) {
  const email = (formData.get("email") as string | null)?.trim();
  if (!email) {
    return { step: "email" as const, error: "Email is required." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    return { step: "email" as const, error: error.message };
  }

  return { step: "code" as const, email };
}

// Verify the 6-digit code. On success, Supabase sets session cookies on the
// current request — the next navigation will see the user signed in.
export async function verifyOtp(_prev: unknown, formData: FormData) {
  const email = (formData.get("email") as string | null)?.trim();
  const token = (formData.get("token") as string | null)?.trim();
  if (!email || !token) {
    return { step: "code" as const, email: email ?? "", error: "Code is required." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return { step: "code" as const, email, error: error.message };
  }

  // Decide where to send the user based on profile state.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle();
    redirect(profile?.onboarded_at ? "/today" : "/onboard");
  }
  redirect("/today");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
