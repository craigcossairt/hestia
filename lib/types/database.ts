// Hand-rolled DB types matching supabase/migrations through 0023.
// Regenerate with `supabase gen types typescript --project-id … > database.ts`
// when possible.

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
  allergies: string[];
  disliked_foods: string[];
  medical_conditions: string[];
  active_programs: string[];
  // Stored as jsonb; shape is FamilyMember[] in lib/family (avoid circular import).
  family_json: unknown[];
  schedule_json: Record<string, unknown>;
  accent_preset: AccentPreset;
  dark_mode: boolean;
  auto_decrement_pantry: boolean;
  never_shop_items: string[];
  preferred_kroger_location_id: string | null;
  preferred_kroger_location_name: string | null;
  preferred_kroger_zip: string | null;
  kroger_user_id: string | null;
  kroger_token_expires_at: string | null;
  // Note: kroger_access_token / kroger_refresh_token intentionally OMITTED
  // from the client-facing Profile type.
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
  tips_json: string[];
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  time_min: number | null;
  prep_min: number | null;
  cook_min: number | null;
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
  slot: Slot | null;
  family_member_id: string | null;
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
