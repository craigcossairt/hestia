import {
  PlanMealSchema,
  PlanWeekSchema,
  type PlanWeekResult,
} from "@/lib/ai/prompts/plan-week";

export type WeekStreamPhase = "streaming" | "saving" | "done" | "error";

export type WeekStreamFinishAction =
  | { type: "wait" }
  | { type: "save"; plan: PlanWeekResult }
  | { type: "incomplete"; mealCount: number }
  | { type: "empty" };

// useObject streams DeepPartial JSON. Trailing model commentary can also
// wipe the hook's latest object. Salvage whatever meals still parse so
// a finished stream with visible cards is saved instead of discarded.

export function streamedMeals(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const meals = (value as { meals?: unknown }).meals;
  if (Array.isArray(meals)) return meals.filter((m) => m != null);
  if (meals && typeof meals === "object") {
    return Object.values(meals as Record<string, unknown>).filter(
      (m) => m != null,
    );
  }
  return [];
}

// useObject mutates the same DeepPartial object in place. slice() keeps
// the inner meal refs, so a failed final parse can empty the snapshot
// the UI still thinks it holds. structuredClone detaches the cards.
export function cloneStreamedMeals(meals: unknown[]): unknown[] {
  try {
    return structuredClone(meals);
  } catch {
    try {
      return JSON.parse(JSON.stringify(meals)) as unknown[];
    } catch {
      return meals.map((meal) =>
        meal && typeof meal === "object"
          ? { ...(meal as Record<string, unknown>) }
          : meal,
      );
    }
  }
}

export function persistablePlanWeek(value: unknown): PlanWeekResult | null {
  const full = PlanWeekSchema.safeParse(value);
  if (full.success) return full.data;
  const raw = streamedMeals(value);
  if (raw.length === 0) return null;
  const meals: PlanWeekResult["meals"] = [];
  for (const entry of raw) {
    const parsed = PlanMealSchema.safeParse(coerceMealInts(entry));
    if (parsed.success) meals.push(parsed.data);
  }
  if (meals.length === 0) return null;
  return { meals };
}

export function preferRicherPlan(
  next: PlanWeekResult | null,
  previous: PlanWeekResult | null,
): PlanWeekResult | null {
  if (!next) return previous;
  if (!previous) return next;
  return next.meals.length >= previous.meals.length ? next : previous;
}

export function weekStreamFinishAction(args: {
  phase: WeekStreamPhase;
  isLoading: boolean;
  sawLoading: boolean;
  saved: boolean;
  mealsSeen: number;
  persistable: PlanWeekResult | null;
}): WeekStreamFinishAction {
  if (args.saved) return { type: "wait" };
  if (args.phase === "saving" || args.phase === "done") return { type: "wait" };
  if (args.isLoading || !args.sawLoading) return { type: "wait" };
  if (args.persistable && args.persistable.meals.length > 0) {
    return { type: "save", plan: args.persistable };
  }
  if (args.mealsSeen > 0) {
    return { type: "incomplete", mealCount: args.mealsSeen };
  }
  if (args.phase === "error") return { type: "wait" };
  return { type: "empty" };
}

export function expectedWeekMealCount(opts: {
  includeSnack: boolean;
  includeDessert: boolean;
  includeBeverage: boolean;
}): number {
  return (
    7 *
    (3 +
      Number(opts.includeSnack) +
      Number(opts.includeDessert) +
      Number(opts.includeBeverage))
  );
}

function coerceMealInts(entry: unknown): unknown {
  if (!entry || typeof entry !== "object") return entry;
  const meal = { ...(entry as Record<string, unknown>) };
  if (meal.recipe && typeof meal.recipe === "object") {
    const recipe = { ...(meal.recipe as Record<string, unknown>) };
    for (const key of [
      "time_min",
      "servings",
      "kcal",
      "protein",
      "carbs",
      "fat",
    ] as const) {
      if (typeof recipe[key] === "number") {
        recipe[key] = Math.round(recipe[key] as number);
      }
    }
    meal.recipe = recipe;
  }
  return meal;
}
