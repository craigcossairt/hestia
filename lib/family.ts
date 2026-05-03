// Family member shape stored in profiles.family_json.

import type { Activity, Goal, Sex } from "@/lib/types/database";

export interface FamilyMember {
  id: string;
  name: string;
  age: number;
  sex?: Sex;
  // Body metrics (full parity with the user). Optional because legacy entries
  // may not have them set yet.
  height_cm?: number | null;
  weight_kg?: number | null;
  activity?: Activity | null;
  goal?: Goal | null;
  // Computed targets (derived via Mifflin–St Jeor on save). Optional for the
  // same legacy reason.
  kcal_target?: number | null;
  protein_target?: number | null;
  carbs_target?: number | null;
  fat_target?: number | null;
  // Per-person eating window. Falls back to user's schedule when unset.
  schedule_json?: { breakfast?: string; lunch?: string; dinner?: string } | null;

  dietary_restrictions: string[];
  // Hard food allergies — never violate.
  allergies?: string[];
  // Soft "would rather not eat" preferences.
  disliked_foods?: string[];
  // Chronic medical conditions that shape food suggestions.
  medical_conditions?: string[];

  notes?: string;
  portion_modifier?: number; // 0.5 kid, 1.0 adult, 1.2 growing teen / training, etc.
  // Pattern + focus programs assigned to this member specifically. Workflow
  // programs only live at the household (user) level.
  active_programs?: string[];
}

export function newFamilyMember(): FamilyMember {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    name: "",
    age: 30,
    dietary_restrictions: [],
    allergies: [],
    disliked_foods: [],
    medical_conditions: [],
    portion_modifier: 1,
    active_programs: [],
  };
}
