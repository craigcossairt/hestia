// Quick macro estimator for ad-hoc meal logs. The user types "a bowl of
// cocoa puffs" and we want sensible estimated kcal/protein/carbs/fat back.
// Honest estimation — round to nearest 5 for kcal, nearest 1 for grams.
//
// Also returns a structured ingredient list when possible so the route
// can refine the AI's eyeballed macros against USDA FoodData Central.
// Same coverage gates as recipe save: when FDC matches a meaningful
// fraction of the meal, use the FDC totals; otherwise keep the AI's
// numbers.

import { z } from "zod";
import { withBaseSystem } from "./system";

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
  // Structured breakdown of what's in the meal so the host system can
  // cross-check against USDA FoodData Central. Optional because some
  // descriptions are too vague to break down (just "lunch") — in that
  // case the AI's eyeballed kcal/protein/etc. are the only signal.
  ingredients: z
    .array(
      z.object({
        name: z.string().describe("Common ingredient name, no brand."),
        qty: z.number().nonnegative(),
        unit: z
          .string()
          .describe(
            "US-style unit when possible: cup, tbsp, tsp, oz, lb, g, kg, ml, l, each.",
          ),
      }),
    )
    .max(15)
    .optional()
    .describe(
      "What's in the meal. Include only when you can make a confident " +
        "breakdown — vague inputs like 'lunch' or 'dinner' should leave " +
        "this field empty. The host uses these for nutrition lookups; " +
        "approximate quantities are fine.",
    ),
});

export type MacroEstimate = z.infer<typeof MacroEstimateSchema>;

export function estimateMacrosPrompt(args: {
  description: string;
  dietary_context?: string[];
}) {
  return withBaseSystem(`You are estimating macros for a meal the user is
logging quickly.
Their description: "${args.description}"
${args.dietary_context?.length ? `Their dietary context: ${args.dietary_context.join(", ")}.` : ""}

Estimate honestly for a typical adult portion. If the description is vague
(e.g. "pasta"), assume the most common preparation and a normal portion.
If it names a brand item (e.g. "cocoa puffs"), use the brand's standard
serving size and macros. If it includes obvious sides ("cocoa puffs with
milk"), include them.

Also break the meal into a short structured ingredient list (name + qty
+ unit) when you can do so confidently — the system uses this to cross-
reference USDA's nutrition database. Skip the ingredients field when
the description is too vague to decompose ("lunch", "dinner").

Return ONLY a valid object matching the schema.`);
}
