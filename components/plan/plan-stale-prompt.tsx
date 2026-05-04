"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Dialog, H, Body, Btn } from "@/components/ds";
import { dismissPlanStaleHint } from "@/app/actions/plan-stale-hint";
import { recomputeTargets } from "@/app/(app)/me/actions";
import type { PlanStaleHint } from "@/lib/plans/staleness";

interface PlanStalePromptProps {
  hint: PlanStaleHint;
}

// One-shot dialog mounted by (app)/layout.tsx whenever the
// plan_stale_hint cookie is present. The cookie is set by mutating
// server actions (updateProfile, updateMember, removeMember,
// addMember, activate/deactivateProgram) when the change might affect
// upcoming planned meals.
//
// Two paths:
// 1. "Update plans" → deep-links to /plan?refine={reason} which the
//    RefinePlanForm reads to auto-open the existing refine modal with
//    a pre-filled prompt.
// 2. Optional checkbox "Also recompute my daily targets" — only shown
//    when hint.offerTargetRecompute is set. Used for body-data edits
//    and program changes where the macro budget might genuinely shift.
//    Runs the recompute *before* the navigate so the new plan refines
//    against the new targets.
export function PlanStalePrompt({ hint }: PlanStalePromptProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [recompute, setRecompute] = useState(false);
  const [pending, setPending] = useState(false);

  function dismiss() {
    setOpen(false);
    void dismissPlanStaleHint();
  }

  async function update() {
    setPending(true);
    void dismissPlanStaleHint();
    if (recompute && hint.offerTargetRecompute) {
      const r = await recomputeTargets();
      // If recompute fails (missing body data, AI hiccup), log and
      // continue to the refine flow anyway — failing the navigate
      // would leave the user stranded with the dialog closed.
      if (r?.error) {
        console.warn("Target recompute skipped:", r.error);
      }
    }
    router.push(`/plan?refine=${encodeURIComponent(hint.reason)}`);
  }

  const meal = hint.upcomingCount === 1 ? "meal" : "meals";

  return (
    <Dialog open={open} onClose={dismiss} size="sm">
      <div className="p-6 flex flex-col gap-4">
        <H size="md" as="h2">
          Update upcoming plans?
        </H>
        <Body>
          {hint.reason}. You have{" "}
          <strong>{hint.upcomingCount}</strong> upcoming planned{" "}
          {meal} that may need adjusting.
        </Body>
        {hint.offerTargetRecompute ? (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={recompute}
              onChange={(e) => setRecompute(e.target.checked)}
              className="w-4 h-4 accent-accent cursor-pointer"
              disabled={pending}
            />
            <Body size="sm">Also recompute my daily targets</Body>
          </label>
        ) : null}
        <div className="flex gap-2 justify-end">
          <Btn variant="outline" onClick={dismiss} disabled={pending}>
            Not now
          </Btn>
          <Btn variant="primary" onClick={update} disabled={pending}>
            <Wand2 size={14} strokeWidth={1.5} />
            {pending
              ? recompute
                ? "Recomputing…"
                : "Updating…"
              : "Update plans"}
          </Btn>
        </div>
      </div>
    </Dialog>
  );
}
