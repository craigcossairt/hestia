"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Sparkles, Plus, Minus, Check } from "lucide-react";
import { Dialog, H, Body, Btn, Label, Mono } from "@/components/ds";
import { PlanRefinementSchema } from "@/lib/ai/prompts/refine-plan";

interface RefinePlanModalProps {
  open: boolean;
  onClose: () => void;
  weekStart?: string;
  userRequest: string;
  // Lookup: existing entry id → "Mon dinner — Sheet pan chicken" (so the
  // remove preview can show what's being deleted, not just an opaque uuid).
  entryLabels: Record<string, string>;
}

type Phase = "streaming" | "applying" | "done" | "error";

const DAY_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short" });

function dayLabel(date: string): string {
  return DAY_FMT.format(new Date(`${date}T00:00:00`)).toLowerCase();
}

export function RefinePlanModal({
  open,
  onClose,
  weekStart,
  userRequest,
  entryLabels,
}: RefinePlanModalProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("streaming");
  const [error, setError] = useState<string | null>(null);
  const [appliedSummary, setAppliedSummary] = useState<{
    removed: number;
    added: number;
  } | null>(null);
  const submittedRef = useRef(false);
  // AbortController for the /refine/apply fetch — mirrors the pattern
  // in StreamingPreviewModal so closing mid-apply doesn't leave a
  // request running for up to 5min on the server.
  const applyCtrlRef = useRef<AbortController | null>(null);

  const { object, submit, isLoading, stop } = useObject({
    api: "/api/ai/plan-week/refine",
    schema: PlanRefinementSchema,
    onError(err) {
      setError(err.message ?? "Refine failed");
      setPhase("error");
    },
  });

  // Kick off the stream once when the modal opens. `submit` is a new
  // ref every render (useObject doesn't memoize); we explicitly omit it
  // from deps because the submittedRef guard makes re-invocation safe
  // but wasteful.
  useEffect(() => {
    if (!open) {
      submittedRef.current = false;
      setPhase("streaming");
      setError(null);
      setAppliedSummary(null);
      return;
    }
    if (submittedRef.current) return;
    submittedRef.current = true;
    submit({
      week_start: weekStart,
      user_request: userRequest,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weekStart, userRequest]);

  // Abort any in-flight apply on unmount.
  useEffect(() => {
    return () => {
      applyCtrlRef.current?.abort();
    };
  }, []);

  function applyDiff() {
    if (!object) return;
    // Re-entry guard: phase === "applying" means a request is already
    // in flight (or just resolved + state hasn't flipped yet). Without
    // this check, double-clicking Apply created a second AbortController,
    // orphaned the first request (its setState chain still ran into an
    // unmounted-or-stale component), and could enqueue duplicate writes
    // server-side.
    if (phase === "applying") return;
    setPhase("applying");
    setError(null);
    applyCtrlRef.current = new AbortController();
    const signal = applyCtrlRef.current.signal;
    (async () => {
      try {
        const res = await fetch("/api/ai/plan-week/refine/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ diff: object }),
          signal,
        });
        const text = await res.text();
        let json: {
          ok?: boolean;
          error?: string;
          removed?: number;
          added?: number;
        } = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          throw new Error(
            res.ok
              ? "Server returned a non-JSON response."
              : `Server error (${res.status}).`,
          );
        }
        if (!res.ok) {
          throw new Error(json.error ?? `Apply failed (${res.status}).`);
        }
        setAppliedSummary({
          removed: json.removed ?? 0,
          added: json.added ?? 0,
        });
        setPhase("done");
        router.refresh();
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setError((err as Error).message);
        setPhase("error");
      }
    })();
  }

  function handleClose() {
    if (phase === "streaming") stop();
    applyCtrlRef.current?.abort();
    onClose();
  }

  function friendlyError(raw: string): string {
    const lower = raw.toLowerCase();
    if (
      lower.includes("function_invocation_timeout") ||
      lower.includes("timed out")
    ) {
      return "The refine took too long and timed out. Try a smaller request, or try again.";
    }
    if (lower.includes("non-json") || lower.includes("unexpected token")) {
      return "The server returned an unexpected response. Wait a moment and try again.";
    }
    if (
      lower.includes("rate limit") ||
      lower.includes("rate_limit") ||
      lower.includes("429")
    ) {
      return "Hit a rate limit on the AI provider. Wait a minute and try again.";
    }
    return raw;
  }

  const removeIds = object?.remove ?? [];
  const adds = object?.add ?? [];
  const explanation = object?.explanation;

  // "Stream complete" = AI is done streaming AND we have at least an
  // explanation field (best signal that the model finished thinking).
  const streamComplete =
    !isLoading && phase === "streaming" && (!!explanation || !!removeIds.length || !!adds.length);

  return (
    <Dialog open={open} onClose={handleClose} size="lg">
      <div className="p-6 flex flex-col gap-5 max-h-[80vh]">
        <div className="flex items-center justify-between">
          <Label accent>refine plan</Label>
          <button
            onClick={handleClose}
            className="text-ink-3 hover:text-ink text-[13px]"
            disabled={phase === "applying"}
          >
            {phase === "streaming" || phase === "applying" ? "Cancel" : "Close"}
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <H size="md" as="h2">
            {phase === "streaming"
              ? "Hestia is thinking…"
              : phase === "applying"
                ? "Applying changes…"
                : phase === "done"
                  ? "Plan updated."
                  : "Something went wrong."}
          </H>
          <Body size="sm" dim>
            <span className="font-mono text-[12px] text-ink-3">
              You said:
            </span>{" "}
            <span className="text-ink-2 italic">&quot;{userRequest}&quot;</span>
          </Body>
        </div>

        {explanation ? (
          <div className="rounded-thumb bg-accent-tint border border-accent/30 p-3">
            <Body size="sm" className="text-ink-2 italic">
              {explanation}
            </Body>
          </div>
        ) : null}

        <div className="flex-1 overflow-auto -mx-2 px-2 flex flex-col gap-4">
          {phase === "streaming" && !explanation && removeIds.length === 0 && adds.length === 0 ? (
            <div className="flex items-center gap-2 py-8 justify-center text-ink-3">
              <Sparkles size={14} strokeWidth={1.5} className="animate-pulse" />
              <Body size="sm" dim>
                Reading your current plan and what you asked for…
              </Body>
            </div>
          ) : null}

          {removeIds.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Minus size={12} strokeWidth={2.2} className="text-danger" />
                <Mono className="text-ink-3 text-[10.5px] uppercase tracking-[1.4px]">
                  remove
                </Mono>
              </div>
              <ul className="flex flex-col rounded-card border border-ink-l overflow-hidden bg-card">
                {removeIds
                  .filter((id): id is string => typeof id === "string")
                  .map((id) => (
                    <li
                      key={id}
                      className="flex items-center gap-3 px-3 py-2 border-b border-ink-l/40 last:border-b-0"
                    >
                      <Minus
                        size={12}
                        strokeWidth={2.2}
                        className="text-danger shrink-0"
                      />
                      <Body size="sm" className="text-ink line-through opacity-70 truncate">
                        {entryLabels[id] ?? id}
                      </Body>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          {adds.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Plus size={12} strokeWidth={2.2} className="text-success" />
                <Mono className="text-ink-3 text-[10.5px] uppercase tracking-[1.4px]">
                  add
                </Mono>
              </div>
              <ul className="flex flex-col rounded-card border border-ink-l overflow-hidden bg-card">
                {adds.map((a, i) => {
                  const slotLabel = a?.slot ? `${dayLabel(a.date ?? "")} ${a.slot}` : "";
                  const isLeftover =
                    typeof a?.is_leftover_of_existing_entry_id === "string" ||
                    typeof a?.is_leftover_of_add_index === "number";
                  const name = a?.recipe?.name;
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-3 px-3 py-2 border-b border-ink-l/40 last:border-b-0"
                    >
                      <Plus
                        size={12}
                        strokeWidth={2.2}
                        className="text-success shrink-0"
                      />
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3 w-20 shrink-0">
                        {slotLabel || "…"}
                      </span>
                      <div className="flex-1 min-w-0">
                        {name ? (
                          <Body size="sm" className="text-ink truncate">
                            {isLeftover ? "(leftover) " : ""}
                            {name}
                          </Body>
                        ) : isLeftover ? (
                          <Body size="sm" dim className="italic">
                            leftover from another meal
                          </Body>
                        ) : (
                          <Body size="sm" dim className="italic animate-pulse">
                            …
                          </Body>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {streamComplete && removeIds.length === 0 && adds.length === 0 ? (
            <Body size="sm" dim>
              Hestia didn&apos;t propose any changes. Try rephrasing.
            </Body>
          ) : null}

          {phase === "done" && appliedSummary ? (
            <div className="flex items-center gap-2 text-success">
              <Check size={14} strokeWidth={2} />
              <Body size="sm">
                Removed {appliedSummary.removed}, added {appliedSummary.added}.
              </Body>
            </div>
          ) : null}

          {phase === "error" && error ? (
            <Body size="sm" className="text-danger">
              {friendlyError(error)}
            </Body>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-ink-l/40">
          {phase === "streaming" ? (
            streamComplete && (removeIds.length > 0 || adds.length > 0) ? (
              <>
                <Btn variant="ghost" onClick={handleClose}>
                  Cancel
                </Btn>
                <Btn variant="primary" onClick={applyDiff}>
                  Apply changes
                </Btn>
              </>
            ) : (
              <Btn variant="ghost" onClick={handleClose}>
                Cancel
              </Btn>
            )
          ) : phase === "applying" ? (
            <Btn variant="ghost" disabled>
              Applying…
            </Btn>
          ) : (
            <Btn variant="primary" onClick={handleClose}>
              {phase === "done" ? "View plan" : "Close"}
            </Btn>
          )}
        </div>
      </div>
    </Dialog>
  );
}
