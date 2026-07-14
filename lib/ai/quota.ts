// Per-user daily AI quota guard.
//
// Default cap: 100 calls/user/day. Override with AI_DAILY_LIMIT_PER_USER.
// Counter resets at midnight UTC (SQL current_date on Supabase).
//
// Production fails closed when the increment RPC is unavailable so a
// missing migration cannot silently remove cost protection. Local/dev
// still fails open unless AI_QUOTA_FAIL_CLOSED=true.

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_DAILY_LIMIT = 100;

function getDailyLimit(): number {
  const raw = process.env.AI_DAILY_LIMIT_PER_USER;
  if (!raw) return DEFAULT_DAILY_LIMIT;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

function shouldFailClosed(): boolean {
  if (process.env.AI_QUOTA_FAIL_CLOSED === "true") return true;
  if (process.env.AI_QUOTA_FAIL_CLOSED === "false") return false;
  return process.env.NODE_ENV === "production";
}

export interface QuotaResult {
  ok: boolean;
  used: number;
  limit: number;
  /** Friendly message when ok=false (for server actions). */
  error?: string;
  /** Pre-built NextResponse for Route Handlers. */
  response?: NextResponse;
}

function deny(used: number, limit: number, message: string, status: number): QuotaResult {
  return {
    ok: false,
    used,
    limit,
    error: message,
    response: NextResponse.json(
      { error: message, used, limit },
      { status },
    ),
  };
}

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
    console.warn("ai-quota: increment failed", err);
    if (shouldFailClosed()) {
      return deny(
        0,
        limit,
        "AI quota service is temporarily unavailable. Try again shortly.",
        503,
      );
    }
    return { ok: true, used: 0, limit };
  }

  if (used > limit) {
    return deny(
      used,
      limit,
      `Daily AI limit reached (${limit} calls). Resets at midnight UTC.`,
      429,
    );
  }

  return { ok: true, used, limit };
}

/** Server-action friendly wrapper — returns { error } instead of NextResponse. */
export async function assertAiQuota(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await checkAiQuota(supabase, userId);
  if (!result.ok) {
    return { ok: false, error: result.error ?? "AI quota exceeded." };
  }
  return { ok: true };
}
