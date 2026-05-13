"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Sparkles, Check } from "lucide-react";
import { Dialog, H, Body, Btn, Label, Mono } from "@/components/ds";
import { PlanWeekSchema } from "@/lib/ai/prompts/plan-week";
import { cn } from "@/lib/utils";

interface StreamingPreviewModalProps {
  open: boolean;
  onClose: () => void;
  weekStart?: string;
  includeSnack: boolean;
  includeDessert: boolean;
  includeBeverage: boolean;
  regenerate: boolean;
}

type Phase = "streaming" | "saving" | "done" | "error";

const SLOT_ORDER = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
  "beverage",
] as const;

const DAY_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short" });

export function StreamingPreviewModal({
  open,
  onClose,
  weekStart,
  includeSnack,
  includeDessert,
  includeBeverage,
  regenerate,
}: StreamingPreviewModalProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("streaming");
  const [error, setError] = useState<string | null>(null);
  const [savedSummary, setSavedSummary] = useState<{
    created: number;
    skipped: number;
  } | null>(null);
  const submittedRef = useRef(false);
  const savedRef = useRef(false);
  // AbortController for the /save fetch. Closing the modal mid-save used
  // to leave the request running for up to 5min on the server, with the
  // setState chain in the .then handler firing into an unmounted
  // component. Worse, an impatient user who closed + re-clicked Generate
  // would stack a second concurrent save against the same rows.
  const saveCtrlRef = useRef<AbortController | null>(null);

  const { object, submit, isLoading, stop } = useObject({
    api: "/api/ai/plan-week/preview",
    schema: PlanWeekSchema,
    onError(err) {
      setError(err.message ?? "Stream failed");
      setPhase("error");
    },
  });

  const [elapsed, setElapsed] = useState(0);

  // Kick off the stream once when the modal opens.
  // `submit` from useObject is a new function reference every render
  // (the SDK does not memoize it). Including it in deps would fire this
  // effect on every render — the submittedRef guard makes that safe but
  // wasteful, so we omit it explicitly via lint-disable.
  useEffect(() => {
    if (!open) {
      // Abort any in-flight save BEFORE clearing refs. handleClose
      // covers the user-click path, but the parent can also flip
      // `open` directly (e.g., on route change). A reopen without
      // this abort could stack a second save against the same plan.
      saveCtrlRef.current?.abort();
      saveCtrlRef.current = null;
      submittedRef.current = false;
      savedRef.current = false;
      setPhase("streaming");
      setError(null);
      setSavedSummary(null);
      setElapsed(0);
      return;
    }
    if (submittedRef.current) return;
    submittedRef.current = true;
    submit({
      week_start: weekStart,
      include_snack: includeSnack,
      include_dessert: includeDessert,
      include_beverage: includeBeverage,
      regenerate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weekStart, includeSnack, includeDessert, includeBeverage, regenerate]);

  // Abort any in-flight save when the component unmounts. handleClose
  // also aborts proactively (more reliable than relying on unmount
  // because the parent may keep the dialog mounted with open=false).
  useEffect(() => {
    return () => {
      saveCtrlRef.current?.abort();
    };
  }, []);

  // 1Hz timer while the request is in flight so the long wait feels
  // intentional. Counter resets on close.
  useEffect(() => {
    if (!open || phase === "done" || phase === "error") return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [open, phase]);

  // When the stream completes, kick off the save.
  useEffect(() => {
    if (
      phase !== "streaming" ||
      isLoading ||
      !object ||
      savedRef.current
    ) {
      return;
    }
    if (!Array.isArray(object.meals) || object.meals.length === 0) {
      // Stream ended with nothing — nothing to save.
      setError("Generator returned no meals.");
      setPhase("error");
      return;
    }
    savedRef.current = true;
    setPhase("saving");
    saveCtrlRef.current = new AbortController();
    const signal = saveCtrlRef.current.signal;
    (async () => {
      try {
        const res = await fetch("/api/ai/plan-week/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            week_start: weekStart,
            include_snack: includeSnack,
            include_dessert: includeDessert,
            include_beverage: includeBeverage,
            regenerate,
            result: object,
          }),
          signal,
        });
        const text = await res.text();
        let json: {
          ok?: boolean;
          error?: string;
          created?: Array<unknown>;
          skipped?: number;
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
          throw new Error(json.error ?? `Save failed (${res.status}).`);
        }
        setSavedSummary({
          created: json.created?.length ?? 0,
          skipped: json.skipped ?? 0,
        });
        setPhase("done");
        router.refresh();
      } catch (err) {
        // Aborts come through here as a DOMException with name "AbortError"
        // (or the polyfilled equivalent). Treat as silent — the user
        // closed the modal intentionally; don't flash an error.
        if ((err as { name?: string }).name === "AbortError") return;
        setError((err as Error).message);
        setPhase("error");
      }
    })();
  }, [
    phase,
    isLoading,
    object,
    weekStart,
    includeSnack,
    includeDessert,
    includeBeverage,
    regenerate,
    router,
  ]);

  function handleClose() {
    if (phase === "streaming") stop();
    // Abort the save unconditionally — even in "saving" phase the user
    // gets to back out instead of waiting up to 5min for the request
    // to complete on its own.
    saveCtrlRef.current?.abort();
    onClose();
  }

  // Translate raw error messages into something actionable. Vercel's
  // FUNCTION_INVOCATION_TIMEOUT and similar opaque platform codes get a
  // friendlier explanation.
  function friendlyError(raw: string): string {
    const lower = raw.toLowerCase();
    if (lower.includes("function_invocation_timeout") || lower.includes("timed out")) {
      return "The plan took too long to generate and timed out. The model is on a slow path right now — try again, or try with fewer optional slots (snack/dessert/beverage).";
    }
    if (lower.includes("non-json") || lower.includes("unexpected token")) {
      return "The server returned an unexpected response. Wait a moment and try again.";
    }
    if (lower.includes("rate limit") || lower.includes("rate_limit") || lower.includes("429")) {
      return "Hit a rate limit on the AI provider. Wait a minute and try again.";
    }
    return raw;
  }

  // Group streamed meals by date for the preview list. Memoized on the
  // meals array so the Map rebuild + sort doesn't re-run on every
  // unrelated render (the 1Hz timer alone forces a re-render every
  // second; previously each one rebuilt this structure from scratch,
  // which compounded with useObject's per-chunk re-renders during a
  // 21-meal stream to noticeably pin the main thread).
  const { mealsByDate, orderedDates, total, named } = useMemo(() => {
    const byDate = new Map<
      string,
      Array<{ slot: string; name: string | null; isLeftover: boolean }>
    >();
    const meals = object?.meals ?? [];
    for (const m of meals) {
      if (!m?.date || !m?.slot) continue;
      const arr = byDate.get(m.date) ?? [];
      arr.push({
        slot: m.slot,
        name: m.recipe?.name ?? null,
        isLeftover: typeof m.is_leftover_of_index === "number",
      });
      byDate.set(m.date, arr);
    }
    const dates = [...byDate.keys()].sort();
    const namedCount = meals.filter(
      (m) => m?.recipe?.name || typeof m?.is_leftover_of_index === "number",
    ).length;
    return {
      mealsByDate: byDate,
      orderedDates: dates,
      total: meals.length,
      named: namedCount,
    };
  }, [object?.meals]);

  // Rotating progress hint while we wait for the stream's first tokens.
  // Once meals start arriving, the meal list itself is the progress.
  const waitingHint =
    elapsed < 8
      ? "Reading your inventory, family, and programs…"
      : elapsed < 20
        ? "Drafting recipe ideas…"
        : elapsed < 40
          ? "Balancing macros and ingredient overlap…"
          : elapsed < 70
            ? "Almost there — finalizing the week…"
            : "This is taking longer than usual. Hestia is still working.";

  const stalled = phase === "streaming" && elapsed > 90 && total === 0;

  return (
    <Dialog open={open} onClose={handleClose} size="lg">
      <div className="p-6 flex flex-col gap-5 max-h-[80vh]">
        <div className="flex items-center justify-between">
          <Label accent>generating plan</Label>
          <button
            onClick={handleClose}
            className="text-ink-3 hover:text-ink text-[13px]"
          >
            {phase === "streaming" ? "Cancel" : "Close"}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <H size="md" as="h2">
            {phase === "streaming"
              ? "Drafting your week…"
              : phase === "saving"
                ? "Saving + finding photos…"
                : phase === "done"
                  ? "Plan saved."
                  : "Something went wrong."}
          </H>
          <Body size="sm" dim>
            {phase === "streaming" && total > 0 && (
              <>
                Drafted {named} of {total} meals · {elapsed}s elapsed
              </>
            )}
            {phase === "streaming" && total === 0 && (
              <>
                {waitingHint} · {elapsed}s elapsed
              </>
            )}
            {phase === "saving" && (
              <>
                {total} meals drafted — now resolving photos and writing the
                plan.
              </>
            )}
            {phase === "done" && savedSummary && (
              <>
                Added {savedSummary.created} meal
                {savedSummary.created === 1 ? "" : "s"}
                {savedSummary.skipped
                  ? `, skipped ${savedSummary.skipped} (already filled).`
                  : "."}
              </>
            )}
            {phase === "error" && error ? friendlyError(error) : null}
          </Body>
        </div>

        <div className="flex-1 overflow-auto -mx-2 px-2 flex flex-col gap-4">
          {orderedDates.length === 0 && phase === "streaming" ? (
            <div className="flex flex-col items-center gap-3 py-8 text-ink-3">
              <div className="flex items-center gap-2">
                <Sparkles
                  size={14}
                  strokeWidth={1.5}
                  className="animate-pulse"
                />
                <Body size="sm" dim>
                  {waitingHint}
                </Body>
              </div>
              {stalled ? (
                <div className="rounded-thumb border border-warn/40 bg-warn/5 px-4 py-3 text-center max-w-md">
                  <Body size="xs" className="text-warn">
                    The model hasn&apos;t streamed any data yet. Network
                    issues or a slow upstream can cause this — try
                    Cancel and Generate again.
                  </Body>
                </div>
              ) : null}
            </div>
          ) : null}
          {orderedDates.map((date) => {
            const dayLabel = DAY_FMT.format(new Date(`${date}T00:00:00`));
            const meals = mealsByDate.get(date) ?? [];
            const sorted = [...meals].sort(
              (a, b) =>
                SLOT_ORDER.indexOf(a.slot as (typeof SLOT_ORDER)[number]) -
                SLOT_ORDER.indexOf(b.slot as (typeof SLOT_ORDER)[number]),
            );
            return (
              <div key={date} className="flex flex-col gap-1.5">
                <Mono className="text-ink-3 text-[10.5px] uppercase tracking-[1.4px]">
                  {dayLabel.toLowerCase()}
                </Mono>
                <ul className="flex flex-col rounded-card border border-ink-l overflow-hidden bg-card">
                  {sorted.map((m, i) => (
                    <li
                      key={`${m.slot}-${i}`}
                      className="flex items-center gap-3 px-3 py-2 border-b border-ink-l/40 last:border-b-0"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3 w-16 shrink-0">
                        {m.slot}
                      </span>
                      <div className="flex-1 min-w-0">
                        {m.name ? (
                          <Body size="sm" className="text-ink truncate">
                            {m.isLeftover ? "(leftover) " : ""}
                            {m.name}
                          </Body>
                        ) : m.isLeftover ? (
                          <Body size="sm" dim className="italic">
                            leftover from earlier this week
                          </Body>
                        ) : (
                          <Body size="sm" dim className="italic animate-pulse">
                            …
                          </Body>
                        )}
                      </div>
                      {m.name ? (
                        <Check
                          size={12}
                          strokeWidth={2.2}
                          className="text-success shrink-0"
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-ink-l/40">
          {phase === "error" ? (
            <Btn variant="primary" onClick={handleClose}>
              Close
            </Btn>
          ) : phase === "done" ? (
            <Btn variant="primary" onClick={handleClose}>
              View plan
            </Btn>
          ) : (
            <Btn
              variant="ghost"
              onClick={handleClose}
              className={cn(phase === "saving" && "pointer-events-none opacity-50")}
            >
              {phase === "streaming" ? "Cancel" : "Saving…"}
            </Btn>
          )}
        </div>
      </div>
    </Dialog>
  );
}
