// "Hestia spotted" — a Noom-style behavioural nudge surfaced once a day on the
// Today screen. Distilled from prompt #8 in the source thread.

import { withBaseSystem } from "./system";

interface InsightContext {
  name?: string | null;
  goal: string;
  kcalTarget: number;
  kcalLoggedToday: number;
  proteinTarget: number;
  proteinLoggedToday: number;
  recentMeals: string[]; // names of last few logged meals
  pantryHighlights: string[]; // names of pantry items worth using soon
}

export function insightPrompt(ctx: InsightContext) {
  return withBaseSystem(`Write ONE short, warm observation (2 sentences max,
under 35 words) the user will see on their Today screen. It should feel
earned — not generic — and pair an observation with a tiny, specific action.

Today so far:
- Goal: ${ctx.goal}
- kcal: ${ctx.kcalLoggedToday} of ${ctx.kcalTarget}
- protein: ${ctx.proteinLoggedToday} of ${ctx.proteinTarget} g
- recent meals: ${ctx.recentMeals.join(", ") || "none yet"}
- pantry to use soon: ${ctx.pantryHighlights.join(", ") || "nothing flagged"}

Speak in first person ("I noticed…", "Want me to…"). No emoji. No hashtags.
No greeting. Just the observation.`);
}
