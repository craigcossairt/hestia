// Recipe generation + parsing prompts. Distilled from #2 (Precision Nutrition
// 7-day meal plan generator — single-recipe variant) in the source thread.

import { z } from "zod";

export const RecipeSchema = z.object({
  name: z.string().describe("A concise recipe name, sentence case, no fluff."),
  time_min: z.number().int().min(1).max(480),
  kcal: z.number().int().min(50).max(2000),
  protein: z.number().int().min(0).max(200),
  carbs: z.number().int().min(0).max(300),
  fat: z.number().int().min(0).max(150),
  tags: z
    .array(z.string())
    .max(6)
    .describe(
      "Lowercase tags like 'vegetarian', 'high-protein', 'under-30min', 'one-pan'.",
    ),
  ingredients: z
    .array(
      z.object({
        name: z.string(),
        qty: z.number().nonnegative(),
        unit: z.string(),
        aisle: z
          .enum(["produce", "protein", "dairy", "pantry", "frozen", "spices", "bakery"])
          .optional(),
        optional: z.boolean().optional(),
      }),
    )
    .min(2)
    .max(20),
  steps: z
    .array(
      z.object({
        text: z.string().min(4),
        timer_sec: z.number().int().min(0).max(7200).optional(),
      }),
    )
    .min(2)
    .max(15),
});

export type GeneratedRecipe = z.infer<typeof RecipeSchema>;

export function generateRecipePrompt(args: {
  prompt: string;
  dietary_restrictions: string[];
  pantry_hints: string[];
  goal?: string;
  protein_target?: number;
}) {
  const { prompt, dietary_restrictions, pantry_hints, goal, protein_target } = args;
  return `You are Hestia, a calm meal-planning assistant. Generate ONE recipe
that matches the user's request. The recipe must be:

- Realistic, written in plain prose, no marketing fluff.
- Tight ingredient list, ${dietary_restrictions.length ? "respecting these dietary preferences: " + dietary_restrictions.join(", ") + "." : "with no allergen concerns."}
- Macros must be honest. Don't pad with "optional toppings" to hit a number.
${goal ? `- Aligned with this goal: ${goal}.` : ""}
${protein_target ? `- Bias protein density when reasonable; daily protein target is ${protein_target} g.` : ""}
${pantry_hints.length ? `- Prefer ingredients the user already has when natural: ${pantry_hints.slice(0, 12).join(", ")}.` : ""}

User request: "${prompt}"

Return ONLY a valid recipe object matching the schema. No commentary.`;
}

export function parseRecipeFromUrlPrompt(args: { url: string; htmlExcerpt: string }) {
  return `You are extracting a recipe from a webpage. Parse the page content
into the strict recipe schema.

Source URL: ${args.url}

Page content (truncated):
"""
${args.htmlExcerpt.slice(0, 12000)}
"""

Rules:
- Use only what is on the page. Do not invent ingredients or steps.
- If macros aren't on the page, estimate them from the ingredients (and round to whole numbers).
- Convert any ambiguous units to common ones (cup, tbsp, tsp, g, kg, oz, lb, ml, l, each).
- If the page has multiple recipes, pick the primary one.

Return ONLY a valid recipe object matching the schema. No commentary.`;
}

export function substitutionPrompt(args: {
  ingredient: string;
  recipe_name: string;
  pantry_hints: string[];
  dietary_restrictions: string[];
}) {
  return `Suggest 3 substitutions for "${args.ingredient}" in the recipe
"${args.recipe_name}". Each substitution should preserve the recipe's purpose.

User pantry includes: ${args.pantry_hints.join(", ") || "no inventory recorded"}.
Dietary preferences: ${args.dietary_restrictions.join(", ") || "no restrictions"}.

Return three options. For each: name, equivalent quantity, and a one-sentence
reason ("uses pantry spinach", "saves $2 vs blueberries", "adds 8g protein").
Bias the first option toward something already in pantry when sensible.`;
}

export const SubstitutionsSchema = z.object({
  options: z
    .array(
      z.object({
        name: z.string(),
        qty_text: z.string().describe("Human-readable quantity, e.g. '1 cup'"),
        reason: z.string(),
      }),
    )
    .length(3),
});

export type SubstitutionResult = z.infer<typeof SubstitutionsSchema>;
