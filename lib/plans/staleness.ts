// Plan-staleness hints. Set by server actions that mutate household
// composition or program activation, read by the (app) layout to
// surface a one-shot "update upcoming plans?" prompt to the user.
//
// Persistence is via short-lived cookie so the hint survives the
// redirect that some actions (removeMember, etc.) trigger, but doesn't
// haunt the user across sessions if they ignore it.
//
// Why a cookie + global mount instead of per-component state: the
// alternative — wiring 7+ call sites to render their own dialog —
// duplicates the prompt UI everywhere and forces every mutating
// action's caller to know about the prompt. The cookie pattern lets
// any action quietly set the hint and a single dialog handles
// presentation in one place.

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

const COOKIE_NAME = "plan_stale_hint";
const TTL_SECONDS = 15 * 60; // 15-minute window — survives a redirect, dies on session abandonment

export interface PlanStaleHint {
  // Plain-English description of what changed. Becomes the body of the
  // prompt and the seed text for the /plan refine modal so the AI gets
  // a meaningful "what to fix" instruction.
  reason: string;
  // Number of upcoming planned entries (today inclusive). Used in the
  // prompt copy ("you have N upcoming planned meals…") so the user
  // can decide whether updating is worth the time.
  upcomingCount: number;
  // When true, the prompt also offers a "Recompute my daily targets"
  // checkbox. Set by triggers where the change might shift kcal/protein
  // budgets — body-data edits (weight, age, activity, goal) and program
  // activation/deactivation. Plain diet/health edits (allergies,
  // restrictions, dislikes) don't change targets, so the checkbox stays
  // hidden for those.
  offerTargetRecompute?: boolean;
}

// Counts upcoming planned meal entries for the user. Returns null when
// there are zero — no point prompting the user to update something
// that doesn't exist.
export async function buildPlanStaleHint(
  supabase: SupabaseClient,
  userId: string,
  reason: string,
  options: { offerTargetRecompute?: boolean } = {},
): Promise<PlanStaleHint | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await supabase
    .from("meal_plan_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "planned")
    .gte("date", today);
  if (!count || count <= 0) return null;
  const hint: PlanStaleHint = { reason, upcomingCount: count };
  if (options.offerTargetRecompute) {
    hint.offerTargetRecompute = true;
  }
  return hint;
}

export async function setPlanStaleHintCookie(
  hint: PlanStaleHint | null,
): Promise<void> {
  const store = await cookies();
  if (!hint) {
    store.delete(COOKIE_NAME);
    return;
  }
  store.set(COOKIE_NAME, JSON.stringify(hint), {
    maxAge: TTL_SECONDS,
    sameSite: "lax",
    // The dismiss server action clears the cookie, so we don't need
    // client-side JS access — keep it httpOnly for defence in depth.
    httpOnly: true,
    path: "/",
  });
}

export async function readPlanStaleHintCookie(): Promise<PlanStaleHint | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "reason" in parsed &&
      "upcomingCount" in parsed &&
      typeof (parsed as Record<string, unknown>).reason === "string" &&
      typeof (parsed as Record<string, unknown>).upcomingCount === "number"
    ) {
      const obj = parsed as Record<string, unknown>;
      const hint: PlanStaleHint = {
        reason: obj.reason as string,
        upcomingCount: obj.upcomingCount as number,
      };
      if (obj.offerTargetRecompute === true) {
        hint.offerTargetRecompute = true;
      }
      return hint;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearPlanStaleHintCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
