"use client";

import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { Btn, Body, Mono } from "@/components/ds";
import { RefinePlanModal } from "./refine-plan-modal";

interface RefinePlanFormProps {
  weekStart?: string;
  // entry id → "Mon dinner — Sheet pan chicken" so the diff preview can
  // surface what's being removed.
  entryLabels: Record<string, string>;
  // Disable when the plan is empty — there's nothing to refine.
  hasEntries: boolean;
  // Pre-fill the input from a deep link. Set by /plan when navigated
  // from the plan-stale prompt (`/plan?refine=...`). When non-empty
  // and the plan has entries, the refine modal auto-opens with this
  // text submitted, so the user lands on the streaming preview
  // directly without retyping.
  initialRefineText?: string;
}

const EXAMPLES = [
  "Swap Tuesday dinner for something vegetarian",
  "Use up the chicken on Wednesday",
  "Make Friday dinner faster — under 25 min",
  "Add a snack each day this week",
];

export function RefinePlanForm({
  weekStart,
  entryLabels,
  hasEntries,
  initialRefineText,
}: RefinePlanFormProps) {
  const [text, setText] = useState(initialRefineText ?? "");
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState("");

  function refine() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSubmitted(trimmed);
    setOpen(true);
  }

  // Auto-fire when arriving via the plan-stale prompt deep link. Only
  // runs once per mount, guarded on hasEntries so we don't hit a
  // disabled state. The setState calls are intentional here — we
  // need to react to a query-string-driven prop on mount, which is
  // exactly the "synchronise to external system" exception the
  // react-hooks/set-state-in-effect rule allows.
  useEffect(() => {
    if (!initialRefineText || !hasEntries) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubmitted(initialRefineText);
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="rounded-card border border-ink-l bg-card p-4 flex flex-col gap-3 max-w-2xl">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <Mono className="text-ink-3 text-[10.5px] uppercase tracking-[1.4px]">
            Refine
          </Mono>
          {!hasEntries ? (
            <Body size="xs" dim>
              Generate a plan first.
            </Body>
          ) : null}
        </div>
        <div className="flex gap-2 items-stretch">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                refine();
              }
            }}
            disabled={!hasEntries}
            placeholder="Tell Hestia how to adjust this plan…"
            className="flex-1 px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent disabled:opacity-50"
          />
          <Btn
            variant="primary"
            onClick={refine}
            disabled={!hasEntries || text.trim().length < 3}
          >
            <Wand2 size={14} strokeWidth={1.5} />
            Refine
          </Btn>
        </div>
        {hasEntries ? (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setText(ex)}
                className="px-2.5 py-1 rounded-full border border-ink-l text-ink-3 hover:text-ink hover:border-ink-3 font-sans text-[11.5px] transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <RefinePlanModal
        open={open}
        onClose={() => setOpen(false)}
        weekStart={weekStart}
        userRequest={submitted}
        entryLabels={entryLabels}
      />
    </>
  );
}
