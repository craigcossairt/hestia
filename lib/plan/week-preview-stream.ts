import {
  GATEWAY_CREDITS_WEEK_PLAN_MESSAGE,
  goneWeekPlanMessage,
  isGatewayCreditsError,
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
  delta?: string;
  error?: unknown;
};

export function weekPlanTextDeltaText(
  part: WeekPreviewStreamPart,
): string | null {
  if (part.type !== "text-delta") return null;
  if (typeof part.text === "string" && part.text.length > 0) return part.text;
  if (typeof part.delta === "string" && part.delta.length > 0) {
    return part.delta;
  }
  return null;
}

// Responses / chat models sometimes wrap JSON in ```json fences or append
// commentary after the closing brace. useObject concatenates the raw body;
// a failed final parse replaces the streamed meals with undefined.
export function createWeekPlanJsonGate(): {
  push(chunk: string): string;
  complete: boolean;
} {
  let raw = "";
  let emitted = 0;
  let complete = false;

  return {
    get complete() {
      return complete;
    },
    push(chunk: string): string {
      if (complete || chunk.length === 0) return "";
      raw += chunk;
      const json = stripToJsonObject(raw);
      if (json == null) return "";
      const sliced = sliceJsonObject(json);
      const out = sliced.text.slice(emitted);
      emitted = sliced.text.length;
      complete = sliced.complete;
      return out;
    },
  };
}

function stripToJsonObject(raw: string): string | null {
  const unfenced = raw.replace(/^\s*```(?:json)?\s*/i, "");
  const start = unfenced.indexOf("{");
  if (start < 0) return null;
  return unfenced.slice(start);
}

function sliceJsonObject(source: string): { text: string; complete: boolean } {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return { text: source.slice(0, i + 1), complete: true };
      }
    }
  }
  return { text: source, complete: false };
}

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

export function weekPlanModelErrorMessage(
  error: unknown,
  modelId?: string,
  provider?: string,
): string {
  const raw = rawErrorText(error);
  if (statusCodeOf(error) === 410 || (raw != null && isGoneWeekPlanError(raw))) {
    return goneWeekPlanMessage(modelId, provider);
  }
  if (raw != null && isGatewayCreditsError(raw)) {
    return GATEWAY_CREDITS_WEEK_PLAN_MESSAGE;
  }
  if (raw != null) return raw;
  return "The generator failed before any meals streamed.";
}

export async function weekPlanTextStreamResponse(args: {
  fullStream: AsyncIterable<WeekPreviewStreamPart>;
  headers?: Record<string, string>;
  modelId?: string;
  provider?: string;
}): Promise<Response> {
  const iterator = args.fullStream[Symbol.asyncIterator]();
  const gate = createWeekPlanJsonGate();
  let firstText: string | null = null;
  let fail: string | null = null;

  while (true) {
    const { done, value } = await iterator.next();
    if (done) break;
    if (value.type === "error" || value.type === "abort") {
      fail = weekPlanModelErrorMessage(value.error, args.modelId, args.provider);
      console.error("plan-week/preview model error", {
        model: args.modelId,
        provider: args.provider,
        statusCode:
          value.error &&
          typeof value.error === "object" &&
          "statusCode" in value.error
            ? (value.error as { statusCode: unknown }).statusCode
            : undefined,
        error: value.error,
      });
      break;
    }
    const delta = weekPlanTextDeltaText(value);
    if (delta == null) continue;
    const forwarded = gate.push(delta);
    if (forwarded.length > 0) {
      firstText = forwarded;
      break;
    }
  }

  if (firstText == null) {
    return new Response(fail ?? EMPTY_WEEK_PREVIEW_STREAM_MESSAGE, {
      status: 502,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...args.headers,
      },
    });
  }

  const initial = firstText;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(initial));
        if (!gate.complete) {
          while (true) {
            const { done, value } = await iterator.next();
            if (done) break;
            if (value.type === "error" || value.type === "abort") {
              console.error("plan-week/preview model error", value.error);
              break;
            }
            const delta = weekPlanTextDeltaText(value);
            if (delta == null) continue;
            const forwarded = gate.push(delta);
            if (forwarded.length > 0) {
              controller.enqueue(encoder.encode(forwarded));
            }
            if (gate.complete) break;
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
