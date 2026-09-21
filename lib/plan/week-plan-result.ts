import {
  PlanMealSchema,
  PlanWeekSchema,
  type PlanWeekResult,
} from "@/lib/ai/prompts/plan-week";

// useObject streams DeepPartial JSON. Trailing model commentary can also
// wipe the hook's latest object. Salvage whatever meals still parse so
// a finished stream with visible cards is saved instead of discarded.

export function persistablePlanWeek(value: unknown): PlanWeekResult | null {
  const full = PlanWeekSchema.safeParse(value);
  if (full.success) return full.data;
  if (!value || typeof value !== "object" || !("meals" in value)) return null;
  const raw = (value as { meals?: unknown }).meals;
  if (!Array.isArray(raw)) return null;
  const meals: PlanWeekResult["meals"] = [];
  for (const entry of raw) {
    const parsed = PlanMealSchema.safeParse(entry);
    if (parsed.success) meals.push(parsed.data);
  }
  if (meals.length === 0) return null;
  return { meals };
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
