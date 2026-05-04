// Recipe generation + parsing prompts. Distilled from #2 (Precision Nutrition
// 7-day meal plan generator — single-recipe variant) in the source thread.

import { z } from "zod";
import { withBaseSystem } from "./system";

export const RecipeSchema = z.object({
  name: z.string().describe("A concise recipe name, sentence case, no fluff."),
  time_min: z.number().int().min(1).max(480),
  servings: z
    .number()
    .int()
    .min(1)
    .max(20)
    .describe(
      "How many adult servings the full recipe yields. Used by the planner " +
        "for leftovers — e.g. 4 servings + a 2-person household → 2 days of food.",
    ),
  kcal: z
    .number()
    .int()
    .min(50)
    .max(2000)
    .describe("Per-serving calories."),
  protein: z.number().int().min(0).max(200).describe("Per-serving grams."),
  carbs: z.number().int().min(0).max(300).describe("Per-serving grams."),
  fat: z.number().int().min(0).max(150).describe("Per-serving grams."),
  tags: z
    .array(z.string())
    .max(6)
    .describe(
      "Lowercase tags. ALWAYS include exactly one meal type from " +
        "[breakfast, lunch, dinner, dessert, snack, beverage]. " +
        "Then add up to 5 attribute tags like 'vegetarian', 'high-protein', " +
        "'under-30min', 'one-pan'.",
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
  // Hard rules — never violate. Aggregated across user + household.
  allergies?: string[];
  // Soft preferences — avoid when possible.
  disliked_foods?: string[];
  // Medical conditions to bias for.
  medical_conditions?: string[];
}) {
  const {
    prompt,
    dietary_restrictions,
    pantry_hints,
    goal,
    protein_target,
    allergies,
    disliked_foods,
    medical_conditions,
  } = args;
  return withBaseSystem(`Generate ONE recipe that matches the user's request.
The recipe must be:

- Realistic, written in plain prose, no marketing fluff.
- Tight ingredient list, ${dietary_restrictions.length ? "respecting these dietary preferences: " + dietary_restrictions.join(", ") + "." : "with no specific dietary preferences set."}
${allergies?.length ? `- ALLERGIES — NEVER include: ${allergies.join(", ")}. This is a hard rule.` : ""}
${disliked_foods?.length ? `- Avoid these disliked foods when reasonable: ${disliked_foods.join(", ")}.` : ""}
${medical_conditions?.length ? `- Lean toward patterns aligned with: ${medical_conditions.join(", ")}.` : ""}
- US-based user: prefer US units (cup, tbsp, tsp, oz, lb, each) for ingredients. Use grams only for macros.
- Macros must be honest. Don't pad with "optional toppings" to hit a number.
${goal ? `- Aligned with this goal: ${goal}.` : ""}
${protein_target ? `- Bias protein density when reasonable; daily protein target is ${protein_target} g.` : ""}
${pantry_hints.length ? `- Prefer ingredients the user already has when natural: ${pantry_hints.slice(0, 12).join(", ")}.` : ""}

User request: "${prompt}"

Return ONLY a valid recipe object matching the schema. No commentary.`);
}

export function parseRecipeFromPhotoPrompt() {
  return withBaseSystem(`You are reading a recipe from a photo — a cookbook
page, magazine clipping, restaurant menu, or screenshot. Extract the recipe
into the strict schema.

Rules:
- Use only what you can clearly read on the photo. Don't invent ingredients
  or steps. If quantity is illegible, use a sensible default (1 cup, 1 tbsp).
- US-style units when possible (cup, tbsp, tsp, oz, lb, each).
- If macros aren't on the page, estimate from the ingredients (round to whole numbers).
- If multiple recipes are visible, pick the most prominent / largest one.
- Strip extraneous prose ("a family favorite for generations…"). Keep steps
  imperative and concise.

Return ONLY a valid recipe object matching the schema. No commentary.`);
}

export function parseRecipeFromUrlPrompt(args: { url: string; htmlExcerpt: string }) {
  return withBaseSystem(`You are extracting a recipe from a webpage. Parse the
page content into the strict recipe schema.

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

Return ONLY a valid recipe object matching the schema. No commentary.`);
}

export function substitutionPrompt(args: {
  ingredient: string;
  recipe_name: string;
  pantry_hints: string[];
  dietary_restrictions: string[];
}) {
  return withBaseSystem(`Suggest 3 substitutions for "${args.ingredient}" in
the recipe "${args.recipe_name}". Each substitution should preserve the
recipe's purpose.

User pantry includes: ${args.pantry_hints.join(", ") || "no inventory recorded"}.
Dietary preferences: ${args.dietary_restrictions.join(", ") || "no restrictions"}.

Return three options. For each: name, equivalent quantity, and a one-sentence
reason ("uses pantry spinach", "saves $2 vs blueberries", "adds 8g protein").
Bias the first option toward something already in pantry when sensible.`);
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
