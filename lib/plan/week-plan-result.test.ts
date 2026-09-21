import { describe, expect, it } from "vitest";
import {
  expectedWeekMealCount,
  persistablePlanWeek,
} from "@/lib/plan/week-plan-result";

describe("expectedWeekMealCount", () => {
  it("is 21 for breakfast, lunch, and dinner", () => {
    expect(
      expectedWeekMealCount({
        includeSnack: false,
        includeDessert: false,
        includeBeverage: false,
      }),
    ).toBe(21);
  });

  it("adds seven slots per optional meal type", () => {
    expect(
      expectedWeekMealCount({
        includeSnack: true,
        includeDessert: false,
        includeBeverage: true,
      }),
    ).toBe(35);
  });
});

describe("persistablePlanWeek", () => {
  it("returns null for empty or non-objects", () => {
    expect(persistablePlanWeek(undefined)).toBeNull();
    expect(persistablePlanWeek({})).toBeNull();
    expect(persistablePlanWeek({ meals: [] })).toBeNull();
  });

  it("keeps leftover meals that parse without a recipe", () => {
    const result = persistablePlanWeek({
      meals: [
        {
          date: "2026-09-21",
          slot: "lunch",
          is_leftover_of_index: 0,
        },
        { date: "2026-09-21", slot: "dinner" },
      ],
    });
    expect(result?.meals).toEqual([
      {
        date: "2026-09-21",
        slot: "lunch",
        is_leftover_of_index: 0,
      },
    ]);
  });

  it("does not treat a named-only stub as persistable", () => {
    expect(
      persistablePlanWeek({
        meals: [
          {
            date: "2026-09-21",
            slot: "breakfast",
            recipe: { name: "Scrambled Eggs with Toast" },
          },
        ],
      }),
    ).toBeNull();
  });
});
