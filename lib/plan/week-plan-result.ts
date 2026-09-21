import {
  PlanMealSchema,
  PlanWeekSchema,
  type PlanSlot,
  type PlanWeekResult,
} from "@/lib/ai/prompts/plan-week";
import type { GeneratedRecipe } from "@/lib/ai/prompts/recipe";

export type WeekStreamPhase = "streaming" | "saving" | "done" | "error";

export type WeekStreamFinishAction =
  | { type: "wait" }
  | { type: "save"; plan: PlanWeekResult }
  | { type: "incomplete"; mealCount: number }
  | { type: "empty" };

export type PlanPersistIssue = {
  index: number;
  date?: string;
  slot?: string;
  name?: string;
  reason: string;
};

export type PlanSalvageResult = {
  plan: PlanWeekResult | null;
  rawCount: number;
  filledDefaults: number;
  issues: PlanPersistIssue[];
};

const PLAN_SLOTS: readonly PlanSlot[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
  "beverage",
];

const AISLES = [
  "produce",
  "protein",
  "dairy",
  "pantry",
  "frozen",
  "spices",
  "bakery",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PLACEHOLDER_INGREDIENTS: GeneratedRecipe["ingredients"] = [
  { name: "ingredients to taste", qty: 1, unit: "serving" },
  { name: "salt", qty: 1, unit: "pinch" },
];

const PLACEHOLDER_STEPS: GeneratedRecipe["steps"] = [
  { text: "Prepare the ingredients." },
  { text: "Cook until done. Edit this recipe to add full steps." },
];

// useObject streams DeepPartial JSON. Trailing model commentary can also
// wipe the hook's latest object. Salvage whatever meals still parse so
// a finished stream with visible cards is saved instead of discarded.

export function streamedMeals(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const meals = (value as { meals?: unknown }).meals;
  return asList(meals);
}

// useObject mutates the same DeepPartial object in place. slice() keeps
// the inner meal refs, so a failed final parse can empty the snapshot
// the UI still thinks it holds. structuredClone detaches the cards.
export function cloneStreamedMeals(meals: unknown[]): unknown[] {
  try {
    return structuredClone(meals);
  } catch {
    try {
      return JSON.parse(JSON.stringify(meals)) as unknown[];
    } catch {
      return meals.map((meal) =>
        meal && typeof meal === "object"
          ? { ...(meal as Record<string, unknown>) }
          : meal,
      );
    }
  }
}

export function persistablePlanWeek(value: unknown): PlanWeekResult | null {
  return salvagePlanWeek(value).plan;
}

export function salvagePlanWeek(value: unknown): PlanSalvageResult {
  const full = PlanWeekSchema.safeParse(value);
  if (full.success) {
    return {
      plan: full.data,
      rawCount: full.data.meals.length,
      filledDefaults: 0,
      issues: [],
    };
  }
  const raw = streamedMeals(value);
  const meals: PlanWeekResult["meals"] = [];
  const issues: PlanPersistIssue[] = [];
  let filledDefaults = 0;
  raw.forEach((entry, index) => {
    const strict = PlanMealSchema.safeParse(coerceMealInts(entry));
    if (strict.success) {
      meals.push(strict.data);
      return;
    }
    const salvaged = salvageMeal(entry, index);
    if (salvaged.meal) {
      meals.push(salvaged.meal);
      if (salvaged.filledDefaults) filledDefaults += 1;
      return;
    }
    issues.push(salvaged.issue);
  });
  if (meals.length === 0) {
    return { plan: null, rawCount: raw.length, filledDefaults: 0, issues };
  }
  const checked = PlanWeekSchema.safeParse({ meals });
  if (!checked.success) {
    issues.push({
      index: -1,
      reason: flattenZod(checked.error),
    });
    return { plan: null, rawCount: raw.length, filledDefaults, issues };
  }
  return {
    plan: checked.data,
    rawCount: raw.length,
    filledDefaults,
    issues,
  };
}

export function summarizeSalvage(salvage: PlanSalvageResult): {
  rawCount: number;
  persistable: number;
  filledDefaults: number;
  issues: PlanPersistIssue[];
} {
  return {
    rawCount: salvage.rawCount,
    persistable: salvage.plan?.meals.length ?? 0,
    filledDefaults: salvage.filledDefaults,
    issues: salvage.issues.slice(0, 12),
  };
}

export function planWeekRichness(plan: PlanWeekResult | null): number {
  if (!plan) return 0;
  return plan.meals.reduce((sum, meal) => {
    if (typeof meal.is_leftover_of_index === "number") return sum + 1;
    const recipe = meal.recipe;
    if (!recipe) return sum;
    const detailBonus = recipe.tags?.includes("needs-detail") ? 0 : 20;
    return (
      sum +
      1 +
      detailBonus +
      (recipe.ingredients?.length ?? 0) +
      (recipe.steps?.length ?? 0)
    );
  }, 0);
}

export function preferRicherPlan(
  next: PlanWeekResult | null,
  previous: PlanWeekResult | null,
): PlanWeekResult | null {
  if (!next) return previous;
  if (!previous) return next;
  if (next.meals.length !== previous.meals.length) {
    return next.meals.length >= previous.meals.length ? next : previous;
  }
  return planWeekRichness(next) >= planWeekRichness(previous) ? next : previous;
}

export function weekStreamFinishAction(args: {
  phase: WeekStreamPhase;
  isLoading: boolean;
  sawLoading: boolean;
  saved: boolean;
  mealsSeen: number;
  persistable: PlanWeekResult | null;
}): WeekStreamFinishAction {
  if (args.saved) return { type: "wait" };
  if (args.phase === "saving" || args.phase === "done") return { type: "wait" };
  if (args.isLoading || !args.sawLoading) return { type: "wait" };
  if (args.persistable && args.persistable.meals.length > 0) {
    return { type: "save", plan: args.persistable };
  }
  if (args.mealsSeen > 0) {
    return { type: "incomplete", mealCount: args.mealsSeen };
  }
  if (args.phase === "error") return { type: "wait" };
  return { type: "empty" };
}

export function expectedWeekMealCount(opts: {
  includeSnack: boolean;
  includeDessert: boolean;
  includeBeverage: boolean;
}): number {
  return (
    7 *
    (3 +
      Number(opts.includeSnack) +
      Number(opts.includeDessert) +
      Number(opts.includeBeverage))
  );
}

export function weekPlanRequestLog(headers: Headers): {
  vercelId: string | null;
  requestId: string | null;
  deploymentId: string | null;
} {
  return {
    vercelId: headers.get("x-vercel-id"),
    requestId: headers.get("x-request-id") ?? headers.get("x-correlation-id"),
    deploymentId: headers.get("x-vercel-deployment-id"),
  };
}

function salvageMeal(
  entry: unknown,
  index: number,
): {
  meal: PlanWeekResult["meals"][number] | null;
  filledDefaults: boolean;
  issue: PlanPersistIssue;
} {
  const issueBase = mealIssueBase(entry, index);
  if (!entry || typeof entry !== "object") {
    return {
      meal: null,
      filledDefaults: false,
      issue: { ...issueBase, reason: "meal is not an object" },
    };
  }
  const raw = entry as Record<string, unknown>;
  const date = typeof raw.date === "string" ? raw.date : undefined;
  if (!date || !DATE_RE.test(date)) {
    return {
      meal: null,
      filledDefaults: false,
      issue: { ...issueBase, reason: "missing or invalid date" },
    };
  }
  const slot = asSlot(raw.slot);
  if (!slot) {
    return {
      meal: null,
      filledDefaults: false,
      issue: { ...issueBase, date, reason: "missing or invalid slot" },
    };
  }
  const leftover = asInt(raw.is_leftover_of_index, 0, 59);
  if (leftover != null) {
    return {
      meal: { date, slot, is_leftover_of_index: leftover },
      filledDefaults: false,
      issue: issueBase,
    };
  }
  const recipe = salvageRecipe(raw.recipe, slot);
  if (!recipe) {
    return {
      meal: null,
      filledDefaults: false,
      issue: {
        ...issueBase,
        date,
        slot,
        reason: "no leftover index and recipe has no name",
      },
    };
  }
  return {
    meal: { date, slot, recipe: recipe.recipe },
    filledDefaults: recipe.filledDefaults,
    issue: issueBase,
  };
}

function salvageRecipe(
  value: unknown,
  slot: PlanSlot,
): { recipe: GeneratedRecipe; filledDefaults: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const defaults = slotDefaults(slot);
  let filledDefaults = false;
  const pickInt = (
    value: unknown,
    min: number,
    max: number,
    fallback: number,
  ): number => {
    const parsed = asInt(value, min, max);
    if (parsed != null) return parsed;
    filledDefaults = true;
    return fallback;
  };
  const time_min = pickInt(raw.time_min, 1, 480, defaults.time_min);
  const servings = pickInt(raw.servings, 1, 20, defaults.servings);
  const kcal = pickInt(raw.kcal, 50, 2000, defaults.kcal);
  const protein = pickInt(raw.protein, 0, 200, defaults.protein);
  const carbs = pickInt(raw.carbs, 0, 300, defaults.carbs);
  const fat = pickInt(raw.fat, 0, 150, defaults.fat);

  const tags = asList(raw.tags)
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => tag.length > 0)
    .slice(0, 6);
  if (!tags.includes(slot)) tags.unshift(slot);
  let uniqueTags = [...new Set(tags)].slice(0, 6);

  const ingredients = salvageIngredients(raw.ingredients);
  if (ingredients.filled) filledDefaults = true;
  const steps = salvageSteps(raw.steps);
  if (steps.filled) filledDefaults = true;

  if (filledDefaults && !uniqueTags.includes("needs-detail")) {
    uniqueTags = [uniqueTags[0], "needs-detail", ...uniqueTags.slice(1)].slice(
      0,
      6,
    );
  }

  const recipe: GeneratedRecipe = {
    name,
    time_min,
    servings,
    kcal,
    protein,
    carbs,
    fat,
    tags: uniqueTags,
    ingredients: ingredients.items,
    steps: steps.items,
  };

  const mods = salvageFamilyMods(raw.family_modifications);
  if (mods) recipe.family_modifications = mods;
  const tips = salvageTips(raw.tips);
  if (tips) recipe.tips = tips;
  if (typeof raw.image_url === "string" && /^https?:\/\//i.test(raw.image_url)) {
    recipe.image_url = raw.image_url;
  } else if (raw.image_url === null) {
    recipe.image_url = null;
  }

  return { recipe, filledDefaults };
}

function salvageIngredients(value: unknown): {
  items: GeneratedRecipe["ingredients"];
  filled: boolean;
} {
  const items: GeneratedRecipe["ingredients"] = [];
  for (const entry of asList(value)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) continue;
    const qtyRaw = asNumber(raw.qty);
    const qty = qtyRaw == null ? 1 : Math.max(0, qtyRaw);
    const unit = typeof raw.unit === "string" && raw.unit.trim() ? raw.unit : "serving";
    const item: GeneratedRecipe["ingredients"][number] = { name, qty, unit };
    if (typeof raw.aisle === "string" && (AISLES as readonly string[]).includes(raw.aisle)) {
      item.aisle = raw.aisle as (typeof AISLES)[number];
    }
    if (typeof raw.optional === "boolean") item.optional = raw.optional;
    items.push(item);
    if (items.length >= 20) break;
  }
  if (items.length >= 2) return { items, filled: false };
  const padded = [...items];
  for (const placeholder of PLACEHOLDER_INGREDIENTS) {
    if (padded.length >= 2) break;
    padded.push(placeholder);
  }
  return { items: padded, filled: true };
}

function salvageSteps(value: unknown): {
  items: GeneratedRecipe["steps"];
  filled: boolean;
} {
  const items: GeneratedRecipe["steps"] = [];
  for (const entry of asList(value)) {
    if (typeof entry === "string" && entry.trim().length >= 4) {
      items.push({ text: entry.trim() });
    } else if (entry && typeof entry === "object") {
      const raw = entry as Record<string, unknown>;
      const text = typeof raw.text === "string" ? raw.text.trim() : "";
      if (text.length < 4) continue;
      const step: GeneratedRecipe["steps"][number] = { text };
      const timer = asInt(raw.timer_sec, 0, 7200);
      if (timer != null) step.timer_sec = timer;
      items.push(step);
    }
    if (items.length >= 15) break;
  }
  if (items.length >= 2) return { items, filled: false };
  const padded = [...items];
  for (const placeholder of PLACEHOLDER_STEPS) {
    if (padded.length >= 2) break;
    padded.push(placeholder);
  }
  return { items: padded, filled: true };
}

function salvageFamilyMods(
  value: unknown,
): GeneratedRecipe["family_modifications"] | undefined {
  const items: NonNullable<GeneratedRecipe["family_modifications"]> = [];
  for (const entry of asList(value)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const member_name =
      typeof raw.member_name === "string" ? raw.member_name.trim() : "";
    const notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
    if (!member_name || notes.length < 4) continue;
    items.push({ member_name, notes });
    if (items.length >= 8) break;
  }
  return items.length > 0 ? items : undefined;
}

function salvageTips(value: unknown): GeneratedRecipe["tips"] | undefined {
  const items = asList(value)
    .map((tip) => (typeof tip === "string" ? tip.trim() : ""))
    .filter((tip) => tip.length >= 4)
    .slice(0, 8);
  return items.length > 0 ? items : undefined;
}

function slotDefaults(slot: PlanSlot): {
  time_min: number;
  servings: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  switch (slot) {
    case "breakfast":
      return { time_min: 15, servings: 2, kcal: 400, protein: 20, carbs: 40, fat: 15 };
    case "lunch":
      return { time_min: 25, servings: 2, kcal: 520, protein: 32, carbs: 48, fat: 18 };
    case "dinner":
      return { time_min: 35, servings: 2, kcal: 580, protein: 36, carbs: 50, fat: 20 };
    case "snack":
      return { time_min: 10, servings: 2, kcal: 200, protein: 10, carbs: 20, fat: 8 };
    case "dessert":
      return { time_min: 20, servings: 2, kcal: 320, protein: 6, carbs: 42, fat: 14 };
    case "beverage":
      return { time_min: 5, servings: 2, kcal: 80, protein: 2, carbs: 12, fat: 2 };
    default: {
      const _exhaustive: never = slot;
      return _exhaustive;
    }
  }
}

function asSlot(value: unknown): PlanSlot | null {
  return typeof value === "string" && (PLAN_SLOTS as readonly string[]).includes(value)
    ? (value as PlanSlot)
    : null;
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter((item) => item != null);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(
      (item) => item != null,
    );
  }
  return [];
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asInt(value: unknown, min: number, max: number): number | undefined {
  const n = asNumber(value);
  if (n == null) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function coerceMealInts(entry: unknown): unknown {
  if (!entry || typeof entry !== "object") return entry;
  const meal = { ...(entry as Record<string, unknown>) };
  if (meal.recipe && typeof meal.recipe === "object") {
    const recipe = { ...(meal.recipe as Record<string, unknown>) };
    for (const key of [
      "time_min",
      "servings",
      "kcal",
      "protein",
      "carbs",
      "fat",
    ] as const) {
      const n = asNumber(recipe[key]);
      if (n != null) recipe[key] = Math.round(n);
    }
    meal.recipe = recipe;
  }
  const leftover = asNumber(meal.is_leftover_of_index);
  if (leftover != null) meal.is_leftover_of_index = Math.round(leftover);
  return meal;
}

function mealIssueBase(entry: unknown, index: number): PlanPersistIssue {
  if (!entry || typeof entry !== "object") {
    return { index, reason: "" };
  }
  const raw = entry as Record<string, unknown>;
  const recipe =
    raw.recipe && typeof raw.recipe === "object"
      ? (raw.recipe as { name?: unknown })
      : null;
  return {
    index,
    date: typeof raw.date === "string" ? raw.date : undefined,
    slot: typeof raw.slot === "string" ? raw.slot : undefined,
    name: typeof recipe?.name === "string" ? recipe.name : undefined,
    reason: "",
  };
}

function flattenZod(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}
