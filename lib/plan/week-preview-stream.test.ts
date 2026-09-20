import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_WEEK_PREVIEW_STREAM_MESSAGE,
  weekPlanModelErrorMessage,
  weekPlanTextStreamResponse,
  type WeekPreviewStreamPart,
} from "@/lib/plan/week-preview-stream";

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
