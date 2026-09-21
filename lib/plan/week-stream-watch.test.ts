import { describe, expect, it } from "vitest";
import {
  FIRST_MEAL_STALL_SECONDS,
  emptyWeekStreamMessage,
  GONE_WEEK_PLAN_MESSAGE,
  goneWeekPlanMessage,
  isGatewayCreditsError,
  isGoneWeekPlanError,
  isUnhelpfulWeekStreamSchemaError,
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

describe("isGoneWeekPlanError", () => {
  it("matches exact HTTP 410 statusText and status codes", () => {
    expect(isGoneWeekPlanError("Gone")).toBe(true);
    expect(isGoneWeekPlanError("GONE")).toBe(true);
    expect(isGoneWeekPlanError("410 Gone")).toBe(true);
    expect(isGoneWeekPlanError("HTTP 410")).toBe(true);
    expect(isGoneWeekPlanError(GONE_WEEK_PLAN_MESSAGE)).toBe(false);
    expect(isGoneWeekPlanError("Hit a rate limit")).toBe(false);
    expect(isGoneWeekPlanError("Something has gone wrong")).toBe(false);
    expect(isGoneWeekPlanError("Invalid argument for grok-4.3")).toBe(false);
    expect(isGoneWeekPlanError(goneWeekPlanMessage("spacexai/grok-4.3", "gateway"))).toBe(
      false,
    );
  });
});

describe("isGatewayCreditsError", () => {
  it("matches the Vercel Gateway credit-card gate", () => {
    expect(
      isGatewayCreditsError(
        "AI Gateway requires a valid credit card on file to service requests.",
      ),
    ).toBe(true);
    expect(isGatewayCreditsError("https://vercel.com/d?to=%2Fai%3Fmodal%3Dadd-credit-card")).toBe(
      true,
    );
    expect(isGatewayCreditsError("please add-credit-card to your wallet copy")).toBe(
      false,
    );
    expect(isGatewayCreditsError("Gone")).toBe(false);
  });

  it("matches Gateway BYOK paid-credits and top-up modal URLs", () => {
    expect(
      isGatewayCreditsError(
        "Bring Your Own Key (BYOK) is available only with paid credits. Purchase at https://vercel.com/d?to=%2Fai%3Fmodal%3Dtop-up",
      ),
    ).toBe(true);
    expect(
      isGatewayCreditsError(
        "https://vercel.com/d?to=%2Fai%3Fmodal%3Dtop-up",
      ),
    ).toBe(true);
    expect(isGatewayCreditsError("https://vercel.com/?modal=top-up")).toBe(
      true,
    );
    expect(isGatewayCreditsError("paid credits without gateway copy")).toBe(
      false,
    );
  });
});

describe("isUnhelpfulWeekStreamSchemaError", () => {
  it("matches the Zod undefined-object message from useObject onFinish", () => {
    expect(
      isUnhelpfulWeekStreamSchemaError(
        "Invalid input: expected object, received undefined",
      ),
    ).toBe(true);
  });

  it("does not swallow unrelated errors", () => {
    expect(isUnhelpfulWeekStreamSchemaError("Hit a rate limit")).toBe(
      false,
    );
    expect(isUnhelpfulWeekStreamSchemaError("invalid_type")).toBe(false);
  });
});
