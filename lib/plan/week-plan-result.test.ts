import { describe, expect, it } from "vitest";
import {
  cloneStreamedMeals,
  expectedWeekMealCount,
  persistablePlanWeek,
  planWeekRichness,
  preferRicherPlan,
  salvagePlanWeek,
  streamedMeals,
  summarizeSalvage,
  weekPlanRequestLog,
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

  it("salvages a named-only stub with slot defaults so it can save", () => {
    const result = persistablePlanWeek({
      meals: [
        {
          date: "2026-09-21",
          slot: "breakfast",
          recipe: { name: "Scrambled Eggs with Toast" },
        },
      ],
    });
    expect(result?.meals).toHaveLength(1);
    expect(result?.meals[0]?.recipe?.name).toBe("Scrambled Eggs with Toast");
    expect(result?.meals[0]?.recipe?.ingredients.length).toBeGreaterThanOrEqual(
      2,
    );
    expect(result?.meals[0]?.recipe?.steps.length).toBeGreaterThanOrEqual(2);
    expect(result?.meals[0]?.recipe?.tags).toContain("breakfast");
    expect(result?.meals[0]?.recipe?.tags).toContain("needs-detail");
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

  it("keeps complete recipes and salvages named-only stubs beside them", () => {
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
    expect(result?.meals).toHaveLength(2);
    expect(result?.meals[0]?.recipe).toEqual(completeRecipe);
    expect(result?.meals[1]?.recipe?.name).toBe("Half streamed sandwich");
  });

  it("coerces float macros and object-map ingredients", () => {
    const result = persistablePlanWeek({
      meals: [
        {
          date: "2026-09-21",
          slot: "dinner",
          recipe: {
            name: "Sheet pan chicken",
            time_min: 35.4,
            servings: "4",
            kcal: 610.2,
            protein: 42.8,
            carbs: 18,
            fat: 28,
            tags: ["dinner"],
            ingredients: {
              0: { name: "chicken thighs", qty: "1.5", unit: "lb" },
              1: { name: "broccoli", qty: 2, unit: "cup" },
            },
            steps: {
              0: { text: "Roast the chicken." },
              1: { text: "Add broccoli for the last 12 minutes." },
            },
          },
        },
      ],
    });
    expect(result?.meals[0]?.recipe?.time_min).toBe(35);
    expect(result?.meals[0]?.recipe?.servings).toBe(4);
    expect(result?.meals[0]?.recipe?.kcal).toBe(610);
    expect(result?.meals[0]?.recipe?.ingredients).toHaveLength(2);
    expect(result?.meals[0]?.recipe?.steps).toHaveLength(2);
  });

  it("does not clamp a bad leftover index into leftover of meal 0", () => {
    const result = persistablePlanWeek({
      meals: [
        {
          date: "2026-09-21",
          slot: "lunch",
          is_leftover_of_index: -1,
          recipe: { name: "Chicken rice bowl" },
        },
      ],
    });
    expect(result?.meals[0]?.is_leftover_of_index).toBeUndefined();
    expect(result?.meals[0]?.recipe?.name).toBe("Chicken rice bowl");
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

  it("prefers complete recipes over same-length named stubs", () => {
    const stubs = persistablePlanWeek({
      meals: [
        {
          date: "2026-09-21",
          slot: "breakfast",
          recipe: { name: "Veggie omelette" },
        },
      ],
    });
    const complete = persistablePlanWeek({
      meals: [
        {
          date: "2026-09-21",
          slot: "breakfast",
          recipe: completeRecipe,
        },
      ],
    });
    expect(planWeekRichness(complete)).toBeGreaterThan(planWeekRichness(stubs));
    expect(preferRicherPlan(complete, stubs)).toEqual(complete);
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

describe("weekPlanRequestLog", () => {
  it("reads Vercel request headers used in runtime logs", () => {
    const headers = new Headers({
      "x-vercel-id": "sfo1::abc",
      "x-request-id": "req-1",
      "x-vercel-deployment-id": "dpl_123",
    });
    expect(weekPlanRequestLog(headers)).toEqual({
      vercelId: "sfo1::abc",
      requestId: "req-1",
      deploymentId: "dpl_123",
    });
  });
});

describe("salvagePlanWeek", () => {
  it("records why a meal cannot be saved", () => {
    const salvage = salvagePlanWeek({
      meals: [
        { slot: "breakfast", recipe: { name: "No date" } },
        {
          date: "2026-09-21",
          slot: "breakfast",
          recipe: { name: "Scrambled Eggs with Toast" },
        },
      ],
    });
    expect(salvage.plan?.meals).toHaveLength(1);
    expect(salvage.filledDefaults).toBe(1);
    expect(salvage.issues).toEqual([
      {
        index: 0,
        slot: "breakfast",
        name: "No date",
        reason: "missing or invalid date",
      },
    ]);
    expect(summarizeSalvage(salvage).persistable).toBe(1);
  });
});
