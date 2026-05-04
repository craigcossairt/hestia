// Seed a Supabase project with realistic demo data tied to a single
// pre-created user. Used to populate the dedicated `hestia-demo`
// instance so people can try Hestia without signing up — they sign in
// with the published demo email + ask us for the OTP code (or use
// Supabase's "Skip email confirmation" override on the demo project).
//
// Usage:
//   1. In your demo Supabase project, manually create a user with the
//      email you want to publish (e.g. demo@hestia.app). Note the UUID.
//   2. Set env vars locally:
//        SUPABASE_URL=https://xxx.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY=eyJ...   (NOT the anon key)
//        DEMO_USER_ID=<uuid from step 1>
//   3. Run:  npx tsx scripts/seed-demo.ts
//
// The script is idempotent — it deletes existing rows for the demo
// user before re-inserting, so you can run it any time you want a
// fresh demo state.
//
// IMPORTANT: never run this against your production Supabase project.
// It nukes all rows belonging to DEMO_USER_ID.

import { createClient } from "@supabase/supabase-js";
import { SEED_RECIPES } from "../lib/seed/recipes";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    console.error("Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_USER_ID");
    process.exit(1);
  }
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const DEMO_USER_ID = requireEnv("DEMO_USER_ID");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Seeding demo data for user ${DEMO_USER_ID}…`);

  // 1. Wipe existing demo data (idempotent re-run).
  const tables = [
    "meal_logs",
    "meal_plan_entries",
    "weight_logs",
    "saved_recipes",
    "grocery_overrides",
    "grocery_purchases",
    "pantry_items",
    "recipes",
    "insights",
    "recipe_ratings",
    "daily_ai_usage",
  ];
  for (const t of tables) {
    const { error } = await supabase.from(t).delete().eq("user_id", DEMO_USER_ID);
    if (error) console.warn(`  ⚠️  ${t}: ${error.message}`);
  }

  // 2. Profile — plausible adult, household of 3.
  const { error: profileErr } = await supabase
    .from("profiles")
    .upsert({
      id: DEMO_USER_ID,
      name: "Demo",
      onboarded_at: new Date().toISOString(),
      goal: "maintain",
      kcal_target: 2200,
      protein_target: 150,
      carbs_target: 250,
      fat_target: 75,
      dietary_restrictions: [],
      allergies: [],
      disliked_foods: ["liver"],
      medical_conditions: [],
      active_programs: ["family_meals", "sunday_meal_prep"],
      family_json: [
        {
          name: "Sam",
          age: 9,
          dietary_restrictions: [],
          allergies: ["peanuts"],
          disliked_foods: ["mushrooms"],
          medical_conditions: [],
          portion_modifier: 0.6,
          notes: "Plays soccer twice a week.",
        },
        {
          name: "Avery",
          age: 6,
          dietary_restrictions: [],
          allergies: [],
          disliked_foods: ["onions"],
          medical_conditions: [],
          portion_modifier: 0.45,
          notes: "Prefers food not touching on the plate.",
        },
      ],
      never_shop_items: ["water", "ice"],
    });
  if (profileErr) console.warn(`  ⚠️  profile: ${profileErr.message}`);
  else console.log("  ✅ profile");

  // 3. Recipes — load the curated starter library.
  const recipeRows = SEED_RECIPES.map((r) => ({
    user_id: DEMO_USER_ID,
    name: r.name,
    photo_url: r.photo_url,
    kcal: r.kcal,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    time_min: r.time_min,
    tags: r.tags,
    ingredients_json: r.ingredients_json,
    steps_json: r.steps_json,
    source: "manual",
  }));
  const { data: insertedRecipes, error: recipesErr } = await supabase
    .from("recipes")
    .insert(recipeRows)
    .select("id, name, tags");
  if (recipesErr) {
    console.warn(`  ⚠️  recipes: ${recipesErr.message}`);
  } else {
    console.log(`  ✅ recipes (${insertedRecipes?.length ?? 0})`);
  }

  // 4. Pantry — a stocked-but-realistic kitchen.
  const pantryRows = [
    { name: "olive oil", qty: 1, unit: "bottle", location: "pantry" },
    { name: "salt", qty: 1, unit: "container", location: "pantry" },
    { name: "black pepper", qty: 1, unit: "container", location: "pantry" },
    { name: "garlic", qty: 4, unit: "head", location: "pantry" },
    { name: "yellow onion", qty: 3, unit: "each", location: "pantry" },
    { name: "rice", qty: 2, unit: "lb", location: "pantry" },
    { name: "pasta", qty: 1, unit: "lb", location: "pantry" },
    { name: "canned tomatoes", qty: 3, unit: "can", location: "pantry" },
    { name: "chicken breast", qty: 2, unit: "lb", location: "freezer" },
    { name: "ground beef", qty: 1, unit: "lb", location: "freezer" },
    { name: "frozen peas", qty: 1, unit: "bag", location: "freezer" },
    { name: "milk", qty: 1, unit: "gallon", location: "fridge" },
    { name: "eggs", qty: 12, unit: "each", location: "fridge" },
    { name: "plain greek yogurt", qty: 32, unit: "oz", location: "fridge" },
    { name: "cheddar cheese", qty: 8, unit: "oz", location: "fridge" },
    { name: "spinach", qty: 1, unit: "bag", location: "fridge" },
    { name: "carrots", qty: 1, unit: "lb", location: "fridge" },
  ].map((p) => ({ ...p, user_id: DEMO_USER_ID }));
  const { error: pantryErr } = await supabase.from("pantry_items").insert(pantryRows);
  if (pantryErr) console.warn(`  ⚠️  pantry: ${pantryErr.message}`);
  else console.log(`  ✅ pantry (${pantryRows.length})`);

  // 5. Weight logs — 8 weeks of plausible data.
  const today = new Date();
  const weightRows: { user_id: string; logged_at: string; weight_lb: number }[] = [];
  for (let i = 56; i >= 0; i -= 7) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    weightRows.push({
      user_id: DEMO_USER_ID,
      logged_at: d.toISOString().slice(0, 10),
      weight_lb: 178 + (Math.random() - 0.5) * 1.5,
    });
  }
  const { error: weightErr } = await supabase.from("weight_logs").insert(weightRows);
  if (weightErr) console.warn(`  ⚠️  weight_logs: ${weightErr.message}`);
  else console.log(`  ✅ weight_logs (${weightRows.length})`);

  // 6. Meal plan — fill the upcoming week with random recipes.
  if (insertedRecipes && insertedRecipes.length > 0) {
    const breakfasts = insertedRecipes.filter((r) => r.tags?.includes("breakfast"));
    const lunches = insertedRecipes.filter((r) => r.tags?.includes("lunch"));
    const dinners = insertedRecipes.filter((r) => r.tags?.includes("dinner"));
    const others = insertedRecipes;

    const planRows: {
      user_id: string;
      day: string;
      slot: string;
      recipe_id: string;
      status: string;
    }[] = [];
    const monday = new Date(today);
    const dow = monday.getDay();
    monday.setDate(monday.getDate() + (dow === 0 ? -6 : 1 - dow));
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const day = d.toISOString().slice(0, 10);
      const pickFrom = (arr: typeof insertedRecipes) =>
        (arr.length > 0 ? arr : others)[Math.floor(Math.random() * (arr.length || others.length))];
      planRows.push(
        { user_id: DEMO_USER_ID, day, slot: "breakfast", recipe_id: pickFrom(breakfasts).id, status: "planned" },
        { user_id: DEMO_USER_ID, day, slot: "lunch", recipe_id: pickFrom(lunches).id, status: "planned" },
        { user_id: DEMO_USER_ID, day, slot: "dinner", recipe_id: pickFrom(dinners).id, status: "planned" },
      );
    }
    const { error: planErr } = await supabase
      .from("meal_plan_entries")
      .upsert(planRows, { onConflict: "user_id,day,slot,recipe_id", ignoreDuplicates: true });
    if (planErr) console.warn(`  ⚠️  meal_plan_entries: ${planErr.message}`);
    else console.log(`  ✅ meal_plan_entries (${planRows.length})`);
  }

  console.log("\n✅ Demo seed complete.");
  console.log("   Sign in to the demo deploy with the email tied to DEMO_USER_ID.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
