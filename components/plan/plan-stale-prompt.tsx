"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Dialog, H, Body, Btn } from "@/components/ds";
import { dismissPlanStaleHint } from "@/app/actions/plan-stale-hint";
import type { PlanStaleHint } from "@/lib/plans/staleness";

interface PlanStalePromptProps {
  hint: PlanStaleHint;
}

// One-shot dialog mounted by (app)/layout.tsx whenever the
// plan_stale_hint cookie is present. The cookie is set by mutating
// server actions (updateMember, removeMember, addMember,
// activate/deactivateProgram) when the change might affect upcoming
// planned meals.
//
// "Update plans" deep-links to /plan?refine={reason} which the
// RefinePlanForm reads to auto-open the existing refine modal with a
// pre-filled prompt. "Not now" just clears the cookie.
export function PlanStalePrompt({ hint }: PlanStalePromptProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  function dismiss() {
    setOpen(false);
    void dismissPlanStaleHint();
  }

  function update() {
    setOpen(false);
    void dismissPlanStaleHint();
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
        <div className="flex gap-2 justify-end">
          <Btn variant="outline" onClick={dismiss}>
            Not now
          </Btn>
          <Btn variant="primary" onClick={update}>
            <Wand2 size={14} strokeWidth={1.5} />
            Update plans
          </Btn>
        </div>
      </div>
    </Dialog>
  );
}
