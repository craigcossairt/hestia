// Client-side watchdogs for week-plan streaming. The preview modal used
// to sit in "streaming" forever when the HTTP body closed with no meals
// (Vercel 300s timeout, empty 200, hung socket). These helpers are the
// only decision logic — keep them free of React so they can be unit-tested.

export const FIRST_MEAL_STALL_SECONDS = 120;

export const STALLED_WEEK_STREAM_MESSAGE =
  "The plan sat too long without streaming any meals, so Hestia stopped waiting. Try again, or generate without snack/dessert/beverage.";

export const GONE_WEEK_PLAN_MESSAGE =
  "The AI model for week planning is no longer available. Try again in a moment.";

export const GATEWAY_CREDITS_WEEK_PLAN_MESSAGE =
  "Vercel AI Gateway needs its own paid credits (including for BYOK). Hestia bills Grok with XAI_API_KEY on api.x.ai instead — unset AI_PROVIDER=gateway in Vercel env if this still appears.";

export function goneWeekPlanMessage(modelId?: string, provider?: string): string {
  const bits = [modelId, provider].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  if (bits.length === 0) return GONE_WEEK_PLAN_MESSAGE;
  return `The AI model for week planning is no longer available (${bits.join(" via ")}). Try again in a moment.`;
}

export function emptyWeekStreamMessage(elapsedSeconds: number): string {
  if (elapsedSeconds >= 280) {
    return "The plan timed out before any meals streamed. Try again, or generate without snack/dessert/beverage.";
  }
  return "The generator finished without streaming any meals. Try again in a moment.";
}

// useObject onFinish validates the accumulated JSON against PlanWeekSchema.
// An empty or aborted body is `undefined`, which Zod reports as
// "expected object, received undefined". That is not an actionable
// user message — treat it as the empty-stream case instead.
export function isUnhelpfulWeekStreamSchemaError(raw: string): boolean {
  const lower = raw.toLowerCase();
  return lower.includes("expected object") && lower.includes("undefined");
}

// HTTP 410 empty bodies become APICallError.message = "Gone" (the
// statusText). Match only that exact statusText / "410 Gone" — do not
// treat "something has gone wrong" or a grok-4.3 slug as unavailable.
export function isGoneWeekPlanError(raw: string): boolean {
  const lower = raw.trim().toLowerCase();
  return (
    lower === "gone" ||
    lower === "410" ||
    lower === "410 gone" ||
    /^http[\s:-]*410(\s+gone)?$/.test(lower)
  );
}

export function isGatewayCreditsError(raw: string): boolean {
  const lower = raw.toLowerCase();
  if (lower.includes("valid credit card on file")) return true;
  if (lower.includes("ai gateway") && lower.includes("credit card")) return true;
  if (lower.includes("bring your own key") && lower.includes("paid credits")) {
    return true;
  }
  if (/[?&]modal=add-credit-card(?:&|$)/.test(lower)) return true;
  if (/modal%3dadd-credit-card(?:%26|&|$)/.test(lower)) return true;
  if (/modal%3dtop-up(?:%26|&|$)/.test(lower)) return true;
  if (/[?&]modal=top-up(?:&|$)/.test(lower)) return true;
  return false;
}

export function shouldErrorEmptyWeekStream(args: {
  phase: "streaming" | "saving" | "done" | "error";
  isLoading: boolean;
  sawLoading: boolean;
  mealCount: number;
  saved: boolean;
}): boolean {
  return (
    args.phase === "streaming" &&
    args.sawLoading &&
    !args.isLoading &&
    !args.saved &&
    args.mealCount === 0
  );
}

export function shouldAbortStalledWeekStream(args: {
  phase: "streaming" | "saving" | "done" | "error";
  elapsedSeconds: number;
  mealCount: number;
}): boolean {
  return (
    args.phase === "streaming" &&
    args.mealCount === 0 &&
    args.elapsedSeconds >= FIRST_MEAL_STALL_SECONDS
  );
}
