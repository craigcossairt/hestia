// Quick macro estimator for ad-hoc meal logs. The user types "a bowl of
// cocoa puffs" and we want sensible estimated kcal/protein/carbs/fat back.
// Honest estimation — round to nearest 5 for kcal, nearest 1 for grams.

import { z } from "zod";

export const MacroEstimateSchema = z.object({
  kcal: z.number().int().min(0).max(3000),
  protein: z.number().int().min(0).max(300),
  carbs: z.number().int().min(0).max(400),
  fat: z.number().int().min(0).max(200),
  basis: z
    .string()
    .max(120)
    .describe(
      "One short phrase describing the assumed portion, e.g. '1 cup with 1/2 cup milk'.",
    ),
});

export type MacroEstimate = z.infer<typeof MacroEstimateSchema>;

export function estimateMacrosPrompt(args: {
  description: string;
  dietary_context?: string[];
}) {
  return `You are estimating macros for a meal the user is logging quickly.
Their description: "${args.description}"
${args.dietary_context?.length ? `Their dietary context: ${args.dietary_context.join(", ")}.` : ""}

Estimate honestly for a typical adult portion. If the description is vague
(e.g. "pasta"), assume the most common preparation and a normal portion.
If it names a brand item (e.g. "cocoa puffs"), use the brand's standard
serving size and macros. If it includes obvious sides ("cocoa puffs with
milk"), include them.

Return ONLY a valid object matching the schema.`;
}
