// Distilled from prompts #1 (Mayo Clinic dietitian blueprint) and #4
// (Renaissance Periodization macro calculator) in the source thread:
// https://threadreaderapp.com/thread/2045826159636824423.html
//
// We do the math deterministically (lib/ai/targets.ts) and only ask the model
// for the human narrative + a first-week behavioural nudge.

import type { TargetInputs, TargetResult } from "@/lib/ai/targets";
import { withBaseSystem } from "./system";

export function blueprintPrompt(inputs: TargetInputs, targets: TargetResult) {
  return withBaseSystem(`Write a 3-paragraph personalised blueprint for
someone starting Hestia, a meal-planning app.

Their inputs:
- Sex: ${inputs.sex}
- Age: ${inputs.age}
- Height: ${Math.floor(inputs.height_cm / 2.54 / 12)} ft ${Math.round((inputs.height_cm / 2.54) % 12)} in (${inputs.height_cm} cm)
- Weight: ${Math.round(inputs.weight_kg * 2.205)} lb (${inputs.weight_kg} kg)
- Activity: ${inputs.activity}
- Goal: ${inputs.goal}

The user is US-based. When referring to weight or distance in your narrative, use US units (lb, ft, in, cup, oz). Macros stay in grams (universal in nutrition).

The targets they have been assigned (computed via Mifflin–St Jeor — DO NOT
recompute or contradict these):
- Daily kcal: ${targets.kcal}
- Protein: ${targets.protein_g} g (${targets.protein_pct}%)
- Carbs: ${targets.carbs_g} g (${targets.carbs_pct}%)
- Fat: ${targets.fat_g} g (${targets.fat_pct}%)

Write three short paragraphs (under 80 words each):

1. The "why" of this target — one or two sentences explaining how it serves
   their goal, in plain language. No medical disclaimers, no hedging.

2. The macro logic — what role each macro plays for this specific goal. Use
   the assigned numbers, never invent your own.

3. A single, concrete first-week behaviour to focus on. Borrow from Noom-style
   habit psychology: small, specific, paired with an existing routine.

Tone: warm, editorial, like a thoughtful health magazine. No emoji. No
bullet points. No headings. Just three paragraphs separated by blank lines.`);
}
