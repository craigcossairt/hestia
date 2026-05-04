// Hand-rolled DB types matching supabase/migrations/0001_init.sql.
// Replace with `supabase gen types typescript --project-id … > database.ts` once
// the Supabase project is provisioned.

export type Sex = "male" | "female" | "other";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "build" | "energy";
export type PantryLocation = "pantry" | "fridge" | "freezer" | "spices";
export type PantrySource = "manual" | "scan" | "receipt" | "bulk";
export type Slot =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "dessert"
  | "snack"
  | "beverage";
export type PlanStatus = "planned" | "logged" | "skipped";
export type AccentPreset = "charcoal" | "terracotta" | "forest" | "ink";

export interface Profile {
  id: string;
  name: string | null;
  sex: Sex | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity: Activity | null;
  goal: Goal | null;
  kcal_target: number | null;
  protein_target: number | null;
  carbs_target: number | null;
  fat_target: number | null;
  dietary_restrictions: string[];
  schedule_json: Record<string, unknown>;
  accent_preset: AccentPreset;
  dark_mode: boolean;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  name: string;
  qty: number;
  unit: string;
  aisle?: string;
  optional?: boolean;
}

export interface Step {
  text: string;
  timer_sec?: number;
}

export interface Recipe {
  id: string;
  owner_id: string | null;
  name: string;
  photo_url: string | null;
  source_url: string | null;
  source_image_url: string | null;
  ingredients_json: Ingredient[];
  steps_json: Step[];
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  time_min: number | null;
  servings: number;
  tags: string[];
  created_at: string;
}

export interface PantryItem {
  id: string;
  user_id: string;
  name: string;
  location: PantryLocation;
  qty: number;
  unit: string;
  added_at: string;
  expires_at: string | null;
  photo_url: string | null;
  source: PantrySource;
}

export interface MealPlanEntry {
  id: string;
  user_id: string;
  date: string;
  slot: Slot;
  recipe_id: string | null;
  status: PlanStatus;
  is_leftover_of: string | null;
  servings_used: number;
  created_at: string;
}

export interface MealLog {
  id: string;
  user_id: string;
  logged_at: string;
  recipe_id: string | null;
  custom_name: string | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface Insight {
  id: string;
  user_id: string;
  kind: string;
  body: string;
  created_at: string;
  dismissed_at: string | null;
}

export interface RecipeRating {
  user_id: string;
  recipe_id: string;
  rating: number;
  notes: string | null;
  updated_at: string;
}

export interface SavedRecipe {
  user_id: string;
  recipe_id: string;
  saved_at: string;
}

export interface GroceryOverride {
  user_id: string;
  item_key: string;
  checked: boolean;
  custom_qty: string | null;
  updated_at: string;
}
