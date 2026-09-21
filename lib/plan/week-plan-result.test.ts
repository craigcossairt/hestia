import { describe, expect, it } from "vitest";
import {
  cloneStreamedMeals,
  expectedWeekMealCount,
  persistablePlanWeek,
  preferRicherPlan,
  streamedMeals,
  weekStreamFinishAction,
} from "@/lib/plan/week-plan-result";

const completeRecipe = {
  name: "Veggie omelette",
  time_min: 15,
  servings: 2,
  kcal: 320,
  protein: 22,
  carbs: 8,
  fat: 22,
  tags: ["breakfast", "vegetarian"],
  ingredients: [
    { name: "eggs", qty: 3, unit: "count" },
    { name: "spinach", qty: 1, unit: "cup" },
  ],
  steps: [{ text: "Whisk the eggs." }, { text: "Cook until set." }],
};

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

  it("reads meals from a non-array object map", () => {
    const result = persistablePlanWeek({
      meals: {
        0: {
          date: "2026-09-21",
          slot: "lunch",
          is_leftover_of_index: 0,
        },
      },
    });
    expect(result?.meals).toHaveLength(1);
  });

  it("keeps complete recipes next to named-only stubs", () => {
    const result = persistablePlanWeek({
      meals: [
        {
          date: "2026-09-21",
          slot: "breakfast",
          recipe: completeRecipe,
        },
        {
          date: "2026-09-21",
          slot: "lunch",
          recipe: { name: "Half streamed sandwich" },
        },
      ],
    });
    expect(result?.meals).toEqual([
      {
        date: "2026-09-21",
        slot: "breakfast",
        recipe: completeRecipe,
      },
    ]);
  });
});

describe("cloneStreamedMeals", () => {
  it("detaches from in-place useObject mutation", () => {
    const live = [
      {
        date: "2026-09-21",
        slot: "breakfast",
        recipe: { name: "Veggie omelette" },
      },
    ];
    const snapshot = cloneStreamedMeals(live);
    live[0].recipe.name = "";
    live.length = 0;
    expect(snapshot).toHaveLength(1);
    expect(
      (snapshot[0] as { recipe: { name: string } }).recipe.name,
    ).toBe("Veggie omelette");
  });
});

describe("preferRicherPlan", () => {
  it("keeps the previous persistable plan when the hook object is wiped", () => {
    const previous = persistablePlanWeek({
      meals: [
        {
          date: "2026-09-21",
          slot: "breakfast",
          recipe: completeRecipe,
        },
      ],
    });
    expect(preferRicherPlan(null, previous)).toEqual(previous);
    expect(preferRicherPlan(previous, null)).toEqual(previous);
  });
});

describe("streamedMeals", () => {
  it("returns an empty list for missing meals", () => {
    expect(streamedMeals(undefined)).toEqual([]);
    expect(streamedMeals({ meals: null })).toEqual([]);
  });
});

describe("weekStreamFinishAction", () => {
  const leftover = persistablePlanWeek({
    meals: [
      {
        date: "2026-09-21",
        slot: "lunch",
        is_leftover_of_index: 0,
      },
    ],
  });
  if (leftover == null) {
    throw new Error("expected leftover fixture to parse");
  }

  it("saves persistable meals even after the empty-stream error already fired", () => {
    expect(
      weekStreamFinishAction({
        phase: "error",
        isLoading: false,
        sawLoading: true,
        saved: false,
        mealsSeen: 10,
        persistable: leftover,
      }),
    ).toEqual({ type: "save", plan: leftover });
  });

  it("does not treat a finished stream as empty if meals were seen", () => {
    expect(
      weekStreamFinishAction({
        phase: "streaming",
        isLoading: false,
        sawLoading: true,
        saved: false,
        mealsSeen: 10,
        persistable: leftover,
      }).type,
    ).toBe("save");
    expect(
      weekStreamFinishAction({
        phase: "streaming",
        isLoading: false,
        sawLoading: true,
        saved: false,
        mealsSeen: 10,
        persistable: null,
      }),
    ).toEqual({ type: "incomplete", mealCount: 10 });
  });

  it("never reports empty after meals were seen, even in the error phase", () => {
    expect(
      weekStreamFinishAction({
        phase: "error",
        isLoading: false,
        sawLoading: true,
        saved: false,
        mealsSeen: 12,
        persistable: null,
      }),
    ).toEqual({ type: "incomplete", mealCount: 12 });
  });

  it("only empty-streams when no meals were ever seen", () => {
    expect(
      weekStreamFinishAction({
        phase: "streaming",
        isLoading: false,
        sawLoading: true,
        saved: false,
        mealsSeen: 0,
        persistable: null,
      }),
    ).toEqual({ type: "empty" });
  });

  it("waits while the request is in flight", () => {
    expect(
      weekStreamFinishAction({
        phase: "streaming",
        isLoading: true,
        sawLoading: true,
        saved: false,
        mealsSeen: 0,
        persistable: null,
      }),
    ).toEqual({ type: "wait" });
  });
});
