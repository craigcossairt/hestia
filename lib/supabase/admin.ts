// Service-role Supabase client. Bypasses RLS — only use from trusted server
// contexts (cron jobs, admin endpoints). NEVER expose this client to the
// browser. NEVER import from a client component.

import { createClient as createBaseClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Service-role Supabase env vars missing (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY).",
    );
  }
  cached = createBaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
