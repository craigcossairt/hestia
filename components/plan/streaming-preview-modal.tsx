"use client";

import { useEffect, useRef, useState } from "react";
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

  const { object, submit, isLoading, stop } = useObject({
    api: "/api/ai/plan-week/preview",
    schema: PlanWeekSchema,
    onError(err) {
      setError(err.message ?? "Stream failed");
      setPhase("error");
    },
  });

  // Kick off the stream once when the modal opens.
  useEffect(() => {
    if (!open) {
      submittedRef.current = false;
      savedRef.current = false;
      setPhase("streaming");
      setError(null);
      setSavedSummary(null);
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
  }, [
    open,
    submit,
    weekStart,
    includeSnack,
    includeDessert,
    includeBeverage,
    regenerate,
  ]);

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
    onClose();
  }

  // Group streamed meals by date for the preview list.
  const mealsByDate = new Map<string, Array<{ slot: string; name: string | null; isLeftover: boolean }>>();
  for (const m of object?.meals ?? []) {
    if (!m?.date || !m?.slot) continue;
    const arr = mealsByDate.get(m.date) ?? [];
    arr.push({
      slot: m.slot,
      name: m.recipe?.name ?? null,
      isLeftover: typeof m.is_leftover_of_index === "number",
    });
    mealsByDate.set(m.date, arr);
  }
  const orderedDates = [...mealsByDate.keys()].sort();
  const total = object?.meals?.length ?? 0;
  const named = (object?.meals ?? []).filter(
    (m) => m?.recipe?.name || typeof m?.is_leftover_of_index === "number",
  ).length;

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
            {phase === "streaming" && (
              <>
                Streaming {named} of {total || "…"} meals as Hestia drafts
                them.
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
            {phase === "error" && error}
          </Body>
        </div>

        <div className="flex-1 overflow-auto -mx-2 px-2 flex flex-col gap-4">
          {orderedDates.length === 0 && phase === "streaming" ? (
            <div className="flex items-center gap-2 py-8 justify-center text-ink-3">
              <Sparkles size={14} strokeWidth={1.5} className="animate-pulse" />
              <Body size="sm" dim>
                Hestia is reading your inventory, family, and programs…
              </Body>
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
