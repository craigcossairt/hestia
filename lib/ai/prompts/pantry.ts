// Pantry parsing prompts: bulk paste + receipt OCR.

import { z } from "zod";
import { withBaseSystem } from "./system";

export const PantryItemsSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        qty: z.number().positive().default(1),
        unit: z
          .string()
          .min(1)
          .default("each")
          .describe(
            "Singular unit: 'each', 'g', 'kg', 'oz', 'lb', 'cup', 'tbsp', 'tsp', 'ml', 'l', 'can', 'box', 'bag', 'bottle'.",
          ),
        location: z
          .enum(["pantry", "fridge", "freezer", "spices"])
          .describe("Best guess of where this item lives in a typical kitchen."),
      }),
    )
    .min(1),
});

export type PantryItemsParsed = z.infer<typeof PantryItemsSchema>;

export function bulkParsePrompt(text: string) {
  return withBaseSystem(`Parse the following list into a clean array of pantry items. The
input is messy human text — receipts, meal-kit notes, brain-dumps. Normalise
to consistent units, sensible quantities, and assign each to one of:
'pantry', 'fridge', 'freezer', 'spices'.

Rules:
- Lowercase the name. Strip brand names ("Trader Joe's spinach" → "spinach").
- Combine duplicates ("eggs ×6" + "1 dozen eggs" → 1 entry, qty 18, unit each).
- Skip non-food items (bags, receipts numbers, store names).
- If qty isn't given, default to 1.
- US-based user: prefer US units (cup, tbsp, tsp, oz, lb, can, box, bag, bottle, each). Avoid metric unless the source clearly uses it.

Input:
"""
${text}
"""

Return ONLY the items object matching the schema. No commentary.`);
}

export function receiptParsePrompt() {
  return withBaseSystem(`You are reading a grocery receipt photo. Extract
every food item into a clean array of pantry items. Normalise names (strip
brand, lowercase), guess sensible units and locations.

Skip: tax lines, totals, store names, payment info, non-food items.
If quantity is missing, default to 1.

Return ONLY the items object matching the schema. No commentary.`);
}
