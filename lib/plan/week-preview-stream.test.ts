import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_WEEK_PREVIEW_STREAM_MESSAGE,
  weekPlanModelErrorMessage,
  weekPlanTextStreamResponse,
  type WeekPreviewStreamPart,
} from "@/lib/plan/week-preview-stream";
import {
  GONE_WEEK_PLAN_MESSAGE,
  goneWeekPlanMessage,
} from "@/lib/plan/week-stream-watch";

async function* parts(
  events: WeekPreviewStreamPart[],
): AsyncIterable<WeekPreviewStreamPart> {
  for (const event of events) {
    yield event;
  }
}

async function readBody(res: Response): Promise<string> {
  return res.text();
}

describe("weekPlanModelErrorMessage", () => {
  it("prefers Error.message", () => {
    expect(weekPlanModelErrorMessage(new Error("schema rejected"))).toBe(
      "schema rejected",
    );
  });

  it("falls back when the error is empty", () => {
    expect(weekPlanModelErrorMessage({})).toMatch(/failed before any meals/i);
  });

  it("maps HTTP 410 / Gone to a friendly model-unavailable message", () => {
    expect(weekPlanModelErrorMessage(new Error("Gone"))).toBe(
      GONE_WEEK_PLAN_MESSAGE,
    );
    expect(weekPlanModelErrorMessage("410 Gone")).toBe(GONE_WEEK_PLAN_MESSAGE);
    const withStatus = Object.assign(new Error("Gone"), { statusCode: 410 });
    expect(weekPlanModelErrorMessage(withStatus)).toBe(GONE_WEEK_PLAN_MESSAGE);
    const statusOnly = { statusCode: 410 };
    expect(weekPlanModelErrorMessage(statusOnly)).toBe(GONE_WEEK_PLAN_MESSAGE);
  });

  it("includes the model id in the 410 copy so prod slug is visible", () => {
    expect(weekPlanModelErrorMessage(new Error("Gone"), "grok-4.6")).toBe(
      goneWeekPlanMessage("grok-4.6"),
    );
  });

  it("does not treat longer gone-in-a-sentence errors as HTTP 410", () => {
    expect(weekPlanModelErrorMessage(new Error("Something has gone wrong"))).toBe(
      "Something has gone wrong",
    );
    expect(
      weekPlanModelErrorMessage(new Error("Invalid argument for grok-4.3")),
    ).toBe("Invalid argument for grok-4.3");
  });
});

describe("weekPlanTextStreamResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 502 when the stream closes with no text", async () => {
    const res = await weekPlanTextStreamResponse({
      fullStream: parts([{ type: "start" }, { type: "finish" }]),
    });
    expect(res.status).toBe(502);
    expect(await readBody(res)).toBe(EMPTY_WEEK_PREVIEW_STREAM_MESSAGE);
  });

  it("returns 502 with the provider message when the first event is an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await weekPlanTextStreamResponse({
      fullStream: parts([
        { type: "start" },
        { type: "error", error: new Error("Invalid schema for json_schema") },
      ]),
    });
    expect(res.status).toBe(502);
    expect(await readBody(res)).toBe("Invalid schema for json_schema");
  });

  it("returns 502 with friendly copy when the provider error is Gone", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await weekPlanTextStreamResponse({
      fullStream: parts([
        { type: "start" },
        { type: "error", error: new Error("Gone") },
      ]),
      modelId: "grok-4.6",
      headers: { "X-Hestia-Model": "grok-4.6" },
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("X-Hestia-Model")).toBe("grok-4.6");
    expect(await readBody(res)).toBe(goneWeekPlanMessage("grok-4.6"));
  });

  it("streams concatenated text-delta chunks as 200", async () => {
    const res = await weekPlanTextStreamResponse({
      fullStream: parts([
        { type: "start" },
        { type: "text-delta", text: '{"meals":[' },
        { type: "text-delta", text: "]}" },
        { type: "finish" },
      ]),
      headers: { "X-Hestia-Model": "grok-test" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Hestia-Model")).toBe("grok-test");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    expect(await readBody(res)).toBe('{"meals":[]}');
  });
});
