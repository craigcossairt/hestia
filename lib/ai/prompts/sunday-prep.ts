// Sunday Meal Prep — generates a 3-lane parallel cooking timeline.
// Based on prompt #5 in the source thread (minute-by-minute scheduling for
// simultaneous cooking).

import { z } from "zod";
import { withBaseSystem } from "./system";

export const SundayPrepSchema = z.object({
  total_minutes: z.number().int().min(30).max(180),
  meals_covered: z
    .array(z.string())
    .describe(
      "List of meals this prep produces, e.g. '5 lunches: chicken+rice bowl', '3 dinners: salmon+broccoli'.",
    ),
  lanes: z
    .array(
      z.object({
        label: z.enum(["Oven", "Stovetop", "Prep counter"]),
        blocks: z
          .array(
            z.object({
              name: z
                .string()
                .describe("Action: 'Roast salmon', 'Chop veg', 'Boil rice'."),
              start_min: z.number().int().min(0).max(180),
              duration_min: z.number().int().min(2).max(90),
              note: z
                .string()
                .optional()
                .describe(
                  "Optional 1-line tip: '425°F', 'salt the water', 'covered'.",
                ),
            }),
          )
          .min(1),
      }),
    )
    .length(3),
  storage: z
    .array(
      z.object({
        item: z.string(),
        container: z
          .string()
          .describe("'Glass tupperware', 'mason jar', 'zip bag'."),
        keeps: z.string().describe("'4 days fridge', '3 months freezer'."),
      }),
    )
    .min(2),
  reheat: z
    .array(z.string())
    .min(2)
    .describe("Tip per meal type — '90s in microwave with a splash of water'."),
});

export type SundayPrepPlan = z.infer<typeof SundayPrepSchema>;

export function sundayPrepPrompt(args: {
  goal: string | null;
  protein_target: number | null;
  dietary_restrictions: string[];
  pantry_hints: string[];
  user_request?: string;
}) {
  return withBaseSystem(`Generate a Sunday meal-prep plan that runs in
parallel across three lanes (Oven, Stovetop, Prep counter) and finishes
within 90 minutes of active time.

Output should cover ~5 lunches + ~3 dinners, with sensible base ingredients
that overlap across meals.

Constraints:
- US-based user. Use US units (cup, tbsp, tsp, oz, lb).
${args.dietary_restrictions.length ? `- Respect dietary preferences: ${args.dietary_restrictions.join(", ")}.` : ""}
${args.goal ? `- Aligned with goal: ${args.goal}.` : ""}
${args.protein_target ? `- Bias protein density (target ${args.protein_target}g/day).` : ""}
${args.pantry_hints.length ? `- Prefer pantry items where natural: ${args.pantry_hints.slice(0, 12).join(", ")}.` : ""}
${args.user_request ? `- Specific request from the user: "${args.user_request}".` : ""}

Lanes are strict: ALL items go into exactly one of: Oven, Stovetop, Prep
counter. Block names should be short imperative actions ("Roast salmon",
"Chop veg", "Cook quinoa"). Total elapsed time should NOT exceed 90 minutes
when run in parallel.

Return ONLY a valid plan object matching the schema.`);
}
