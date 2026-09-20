// Client-side watchdogs for week-plan streaming. The preview modal used
// to sit in "streaming" forever when the HTTP body closed with no meals
// (Vercel 300s timeout, empty 200, hung socket). These helpers are the
// only decision logic — keep them free of React so they can be unit-tested.

export const FIRST_MEAL_STALL_SECONDS = 120;

export const STALLED_WEEK_STREAM_MESSAGE =
  "The plan sat too long without streaming any meals, so Hestia stopped waiting. Try again, or generate without snack/dessert/beverage.";

export function emptyWeekStreamMessage(elapsedSeconds: number): string {
  if (elapsedSeconds >= 280) {
    return "The plan timed out before any meals streamed. Try again, or generate without snack/dessert/beverage.";
  }
  return "The generator finished without streaming any meals. Try again in a moment.";
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
