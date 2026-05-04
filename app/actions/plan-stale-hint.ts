"use server";

import { clearPlanStaleHintCookie } from "@/lib/plans/staleness";

// Server action invoked by the PlanStalePrompt dialog when the user
// dismisses or accepts. Clearing the cookie ensures the prompt doesn't
// re-fire on the next page navigation.
export async function dismissPlanStaleHint(): Promise<void> {
  await clearPlanStaleHintCookie();
}
