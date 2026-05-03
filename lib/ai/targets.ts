// Deterministic Mifflin–St Jeor BMR + TDEE + macro split.
// Never trust an LLM to do arithmetic. Use this, then have Grok narrate.

import type { Activity, Goal, Sex } from "@/lib/types/database";

export interface TargetInputs {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: Activity;
  goal: Goal;
}

export interface TargetResult {
  bmr: number;
  tdee: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  protein_pct: number;
  carbs_pct: number;
  fat_pct: number;
}

const ACTIVITY_MULTIPLIER: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_KCAL_DELTA: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  build: 300,
  energy: 0,
};

const PROTEIN_G_PER_KG: Record<Goal, number> = {
  lose: 2.2,
  maintain: 1.6,
  build: 2.2,
  energy: 1.6,
};

const FAT_PCT_OF_KCAL: Record<Goal, number> = {
  lose: 0.25,
  maintain: 0.3,
  build: 0.25,
  energy: 0.3,
};

export function computeTargets(input: TargetInputs): TargetResult {
  const { sex, age, height_cm, weight_kg, activity, goal } = input;

  const bmrBase = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  const bmr = sex === "male" ? bmrBase + 5 : sex === "female" ? bmrBase - 161 : bmrBase - 78;

  const tdee = bmr * ACTIVITY_MULTIPLIER[activity];
  const kcal = Math.max(1200, Math.round(tdee + GOAL_KCAL_DELTA[goal]));

  const protein_g = Math.round(weight_kg * PROTEIN_G_PER_KG[goal]);
  const protein_kcal = protein_g * 4;

  const fat_kcal = kcal * FAT_PCT_OF_KCAL[goal];
  const fat_g = Math.round(fat_kcal / 9);

  const carbs_kcal = Math.max(0, kcal - protein_kcal - fat_kcal);
  const carbs_g = Math.round(carbs_kcal / 4);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal,
    protein_g,
    carbs_g,
    fat_g,
    protein_pct: Math.round((protein_kcal / kcal) * 100),
    fat_pct: Math.round((fat_kcal / kcal) * 100),
    carbs_pct: Math.round((carbs_kcal / kcal) * 100),
  };
}
