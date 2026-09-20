import { describe, expect, it } from "vitest";
import {
  FIRST_MEAL_STALL_SECONDS,
  emptyWeekStreamMessage,
  shouldAbortStalledWeekStream,
  shouldErrorEmptyWeekStream,
} from "@/lib/plan/week-stream-watch";

describe("shouldErrorEmptyWeekStream", () => {
  const base = {
    phase: "streaming" as const,
    isLoading: false,
    sawLoading: true,
    mealCount: 0,
    saved: false,
  };

  it("errors when a stream started, finished, and produced no meals", () => {
    expect(shouldErrorEmptyWeekStream(base)).toBe(true);
  });

  it("does not error before the request has started loading", () => {
    expect(shouldErrorEmptyWeekStream({ ...base, sawLoading: false })).toBe(
      false,
    );
  });

  it("does not error while the request is still in flight", () => {
    expect(shouldErrorEmptyWeekStream({ ...base, isLoading: true })).toBe(
      false,
    );
  });

  it("does not error once meals exist", () => {
    expect(shouldErrorEmptyWeekStream({ ...base, mealCount: 3 })).toBe(false);
  });
});

describe("shouldAbortStalledWeekStream", () => {
  it("aborts at the stall threshold when no meals have arrived", () => {
    expect(
      shouldAbortStalledWeekStream({
        phase: "streaming",
        elapsedSeconds: FIRST_MEAL_STALL_SECONDS,
        mealCount: 0,
      }),
    ).toBe(true);
  });

  it("lets a slow stream continue once meals have started arriving", () => {
    expect(
      shouldAbortStalledWeekStream({
        phase: "streaming",
        elapsedSeconds: 200,
        mealCount: 4,
      }),
    ).toBe(false);
  });

  it("does not abort before the threshold", () => {
    expect(
      shouldAbortStalledWeekStream({
        phase: "streaming",
        elapsedSeconds: FIRST_MEAL_STALL_SECONDS - 1,
        mealCount: 0,
      }),
    ).toBe(false);
  });
});

describe("emptyWeekStreamMessage", () => {
  it("mentions timeout near the function budget", () => {
    expect(emptyWeekStreamMessage(303)).toMatch(/timed out/i);
  });
});
