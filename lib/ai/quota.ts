// Per-user daily AI quota guard. Wrap the start of any AI route with
// `await assertAiQuota(supabase, user.id)` and the request will get a
// friendly 429 once the user has burned through their daily allowance.
//
// Default cap: 100 calls/user/day. Override with AI_DAILY_LIMIT_PER_USER.
// The counter resets at midnight UTC (the SQL function uses
// current_date, which is server-time-zone-aware — Supabase defaults to
// UTC unless changed).
//
// Rationale: a single curious friend hitting "generate plan" 50 times
// = ~$15 on the host's xAI bill in a day. The cap is set high enough
// that real use is never inconvenienced (most days I personally use
// ~10 AI calls).

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_DAILY_LIMIT = 100;

function getDailyLimit(): number {
  const raw = process.env.AI_DAILY_LIMIT_PER_USER;
  if (!raw) return DEFAULT_DAILY_LIMIT;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

export interface QuotaResult {
  ok: boolean;
  used: number;
  limit: number;
  // When ok=false, an already-built NextResponse the route can return
  // directly. Saves the route from constructing the 429 body itself.
  response?: NextResponse;
}

// Increments the user's daily counter (atomic via the security-definer
// SQL function) and returns whether they're under the limit. Routes
// should call this immediately after the auth check and before any
// AI work / DB writes.
//
// If the increment fails (e.g. table missing, network blip), we log
// and let the request through — failing closed would brick the app
// for everyone if Supabase has a hiccup, and the worst case of
// failing open is one extra AI call.
export async function checkAiQuota(
  supabase: SupabaseClient,
  userId: string,
): Promise<QuotaResult> {
  const limit = getDailyLimit();
  let used: number;
  try {
    const { data, error } = await supabase.rpc("increment_daily_ai_usage", {
      p_user_id: userId,
    });
    if (error) throw error;
    used = typeof data === "number" ? data : 0;
  } catch (err) {
    console.warn("ai-quota: increment failed, allowing request", err);
    return { ok: true, used: 0, limit };
  }

  if (used > limit) {
    return {
      ok: false,
      used,
      limit,
      response: NextResponse.json(
        {
          error: `Daily AI limit reached (${limit} calls). Resets at midnight UTC.`,
          used,
          limit,
        },
        { status: 429 },
      ),
    };
  }

  return { ok: true, used, limit };
}
