import {
  GONE_WEEK_PLAN_MESSAGE,
  isGoneWeekPlanError,
} from "@/lib/plan/week-stream-watch";

// Turns a model fullStream into an HTTP response for useObject.
//
// streamObject / streamText `.toTextStreamResponse()` only forwards
// text-delta chunks and swallows `error` parts. A failed xAI call
// (bad json_schema, unknown model, 400) therefore looks like HTTP 200
// with an empty body — the modal's empty-stream watchdog, not onError.
//
// Peek the first meaningful event before committing to 200 so an
// immediate model failure becomes 502 with the provider message.

export const EMPTY_WEEK_PREVIEW_STREAM_MESSAGE =
  "The generator finished without streaming any meals. Try again in a moment.";

export type WeekPreviewStreamPart = {
  type: string;
  text?: string;
  error?: unknown;
};

function statusCodeOf(error: unknown): number | undefined {
  if (error && typeof error === "object" && "statusCode" in error) {
    const n = (error as { statusCode: unknown }).statusCode;
    return typeof n === "number" ? n : undefined;
  }
  return undefined;
}

function rawErrorText(error: unknown): string | null {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return null;
}

export function weekPlanModelErrorMessage(error: unknown): string {
  const raw = rawErrorText(error);
  if (statusCodeOf(error) === 410 || (raw != null && isGoneWeekPlanError(raw))) {
    return GONE_WEEK_PLAN_MESSAGE;
  }
  if (raw != null) return raw;
  return "The generator failed before any meals streamed.";
}

function isTextDelta(part: WeekPreviewStreamPart): part is WeekPreviewStreamPart & {
  text: string;
} {
  return part.type === "text-delta" && typeof part.text === "string";
}

export async function weekPlanTextStreamResponse(args: {
  fullStream: AsyncIterable<WeekPreviewStreamPart>;
  headers?: Record<string, string>;
}): Promise<Response> {
  const iterator = args.fullStream[Symbol.asyncIterator]();
  let firstText: string | null = null;
  let fail: string | null = null;

  while (true) {
    const { done, value } = await iterator.next();
    if (done) break;
    if (value.type === "error" || value.type === "abort") {
      fail = weekPlanModelErrorMessage(value.error);
      console.error("plan-week/preview model error", value.error);
      break;
    }
    if (isTextDelta(value) && value.text.length > 0) {
      firstText = value.text;
      break;
    }
  }

  if (firstText == null) {
    return new Response(fail ?? EMPTY_WEEK_PREVIEW_STREAM_MESSAGE, {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const initial = firstText;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(initial));
        while (true) {
          const { done, value } = await iterator.next();
          if (done) break;
          if (value.type === "error" || value.type === "abort") {
            console.error("plan-week/preview model error", value.error);
            break;
          }
          if (isTextDelta(value) && value.text.length > 0) {
            controller.enqueue(encoder.encode(value.text));
          }
        }
        controller.close();
      } catch (err) {
        console.error("plan-week/preview stream", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      ...args.headers,
    },
  });
}
