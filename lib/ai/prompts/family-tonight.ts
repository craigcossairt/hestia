// Family "tonight" plate builder. Distilled from prompt #7 (USDA MyPlate
// family meal planner with picky-eater strategies + allergen management).

import { z } from "zod";
import type { FamilyMember } from "@/lib/family";
import { withBaseSystem } from "./system";

export const FamilyTonightSchema = z.object({
  recipe_name: z.string(),
  shared_base: z
    .string()
    .describe("One sentence — what the cook makes once for everyone."),
  plates: z
    .array(
      z.object({
        member_name: z.string(),
        plate_description: z.string().describe("What ends up on their plate."),
        portion_text: z.string().describe('Like "1 full bowl", "half + extra cheese".'),
        modifications: z
          .array(z.string())
          .describe(
            "Tactical adjustments per person: 'no spice', 'sub bun', 'extra greens'.",
          ),
      }),
    )
    .min(1),
  allergen_notes: z
    .array(z.string())
    .describe(
      "Any allergen warnings or substitutions called out. Empty array if none.",
    ),
  prep_tip: z
    .string()
    .describe(
      "One short sentence on what to prep separately so it scales — 'taco bar', 'sauce on the side'.",
    ),
});

export type FamilyTonightPlan = z.infer<typeof FamilyTonightSchema>;

export function familyTonightPrompt(args: {
  recipe_name: string;
  recipe_summary: string;
  members: FamilyMember[];
}) {
  return withBaseSystem(`You are helping a household plan tonight's dinner.
ONE recipe is being made: "${args.recipe_name}". Recipe details:

${args.recipe_summary}

Household:
${args.members
  .map(
    (m, i) => {
      const meta: string[] = [];
      if (m.dietary_restrictions.length) meta.push(m.dietary_restrictions.join(", "));
      if (m.allergies?.length) meta.push(`ALLERGY: ${m.allergies.join(", ")}`);
      if (m.disliked_foods?.length) meta.push(`dislikes ${m.disliked_foods.join(", ")}`);
      if (m.medical_conditions?.length) meta.push(`managing ${m.medical_conditions.join(", ")}`);
      if (m.notes) meta.push(m.notes);
      return `${i + 1}. ${m.name} — age ${m.age}${m.sex ? `, ${m.sex}` : ""}, portion ${m.portion_modifier ?? 1}x${meta.length ? `; ${meta.join("; ")}` : ""}`;
    },
  )
  .join("\n")}

Goal: explain how the cook makes this ONE recipe in a way that lands well for
each person. Use the USDA MyPlate "decompose to components" approach when
useful — e.g., a taco bar where everyone builds their own, or a sheet pan
with sauces and toppings on the side.

Rules:
- US units (cup, tbsp, oz, lb).
- Each member's portion_text and modifications should be concrete and small.
- ALLERGIES are hard rules — if the base recipe contains an allergen for
  someone, surface a swap in their modifications and add an allergen_note.
- Disliked foods: try to swap or omit on that person's plate.
- Medical conditions: bias their plate toward aligned patterns where simple.
- Keep prep_tip to one short sentence.

Return ONLY a valid plan object matching the schema.`);
}
