import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getModel,
  getModelOpts,
  getProviderOptions,
} from "@/lib/ai/provider";
import { resolveRecipePhoto } from "@/lib/ai/photo";
import {
  PlanWeekSchema,
  planWeekPrompt,
  type PlanSlot,
} from "@/lib/ai/prompts/plan-week";
import { buildProgramContext } from "@/lib/programs";
import type { FamilyMember } from "@/lib/family";

// Photos add ~5–15s on top of dinner generation; longer plans need
// more headroom. Vercel default is 300s on all plans now.
export const maxDuration = 300;

// Fixed slots that are always part of a plan; the generator will fill them
// regardless of toggles. Snack / dessert / beverage are opt-in.
const REQUIRED_SLOTS: PlanSlot[] = ["breakfast", "lunch", "dinner"];

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

interface RequestBody {
  week_start?: string;
  include_snack?: boolean;
  include_dessert?: boolean;
  include_beverage?: boolean;
  // When true, planner deletes existing 'planned' entries for the week
  // before regenerating. Default false (additive).
  regenerate?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as RequestBody | null;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Hydrate context.
    const [{ data: profile }, { data: pantry }, { data: recent }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select(
            "goal, protein_target, dietary_restrictions, allergies, disliked_foods, medical_conditions, active_programs, family_json",
          )
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("pantry_items")
          .select("name")
          .eq("user_id", user.id)
          .limit(60),
        supabase
          .from("recipes")
          .select("name")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    const userProgramIds =
      ((profile as { active_programs?: string[] | null } | null)
        ?.active_programs) ?? [];
    const family = (
      (profile as { family_json?: FamilyMember[] | null } | null)?.family_json ??
      []
    ).filter((f) => f.name && f.name.trim().length > 0);

    const programContext = buildProgramContext({
      userProgramIds,
      members: family,
    });

    const householdAllergies = Array.from(
      new Set([
        ...(profile?.allergies ?? []),
        ...family.flatMap((f) => f.allergies ?? []),
      ]),
    );
    const householdDislikes = Array.from(
      new Set([
        ...(profile?.disliked_foods ?? []),
        ...family.flatMap((f) => f.disliked_foods ?? []),
      ]),
    );
    const householdMedical = Array.from(
      new Set([
        ...(profile?.medical_conditions ?? []),
        ...family.flatMap((f) => f.medical_conditions ?? []),
      ]),
    );

    // Build the slot list from required + body opt-ins.
    const slots: PlanSlot[] = [...REQUIRED_SLOTS];
    if (body?.include_snack) slots.push("snack");
    if (body?.include_dessert) slots.push("dessert");
    if (body?.include_beverage) slots.push("beverage");

    // Compute the week's 7 dates.
    const requestedWeek =
      body?.week_start && isValidDate(body.week_start)
        ? new Date(`${body.week_start}T00:00:00`)
        : new Date();
    const start = startOfWeek(requestedWeek);
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d.toISOString().slice(0, 10);
    });

    // Optional regenerate: drop existing planned entries for this week +
    // these slots so the generator fills them fresh. Status='logged' or
    // 'skipped' are NEVER touched.
    if (body?.regenerate) {
      await supabase
        .from("meal_plan_entries")
        .delete()
        .eq("user_id", user.id)
        .eq("status", "planned")
        .gte("date", dates[0])
        .lte("date", dates[6])
        .in("slot", slots);
    }

    // Find which (date, slot) pairs are already filled — skip them.
    const { data: existingPlans } = await supabase
      .from("meal_plan_entries")
      .select("date, slot")
      .eq("user_id", user.id)
      .gte("date", dates[0])
      .lte("date", dates[6])
      .in("slot", slots);
    const existing: Array<{ date: string; slot: PlanSlot }> = (
      (existingPlans ?? []) as Array<{ date: string; slot: PlanSlot }>
    ).filter((e) => slots.includes(e.slot));

    const familySummary = family.length
      ? family
          .map(
            (f) =>
              `${f.name} (${f.age}${f.dietary_restrictions.length ? ", " + f.dietary_restrictions.join("/") : ""})`,
          )
          .join(", ")
      : null;

    let meals;
    try {
      const result = await generateObject({
        model: getModel("fast"),
        schema: PlanWeekSchema,
        providerOptions: getProviderOptions(),
        ...getModelOpts(),
        prompt: planWeekPrompt({
          week_dates: dates,
          slots,
          existing,
          goal: profile?.goal ?? null,
          protein_target: profile?.protein_target ?? null,
          dietary_restrictions: profile?.dietary_restrictions ?? [],
          household_allergies: householdAllergies,
          household_dislikes: householdDislikes,
          household_medical: householdMedical,
          pantry_hints: (pantry ?? []).map((p: { name: string }) => p.name),
          recent_recipe_names: (recent ?? []).map((r: { name: string }) => r.name),
          household_size: 1 + family.length,
          active_program_context: programContext,
          family: family.map((f) => ({
            name: f.name,
            age: f.age,
            dietary_restrictions: f.dietary_restrictions ?? [],
            allergies: f.allergies ?? [],
            disliked_foods: f.disliked_foods ?? [],
            medical_conditions: f.medical_conditions ?? [],
            portion_modifier: f.portion_modifier,
            notes: f.notes,
          })),
        }),
      });
      meals = result.object.meals;
    } catch (err) {
      return NextResponse.json(
        { error: `Generation failed: ${(err as Error).message}` },
        { status: 500 },
      );
    }

    if (!Array.isArray(meals) || meals.length === 0) {
      return NextResponse.json(
        { error: "Generator returned no meals." },
        { status: 500 },
      );
    }

    // Process meals in their original AI-array order so is_leftover_of_index
    // references can be resolved by index. We keep two parallel maps:
    //   originalIndex → inserted entry id (for is_leftover_of links)
    //   originalIndex → inserted recipe id (so leftovers reuse the recipe)
    const filledKeys = new Set(existing.map((e) => `${e.date}|${e.slot}`));

    // Resolve photos up-front in parallel — only for meals that contain a
    // recipe AND will actually be inserted (slot/date valid + not filled).
    const photoTargets: Array<{
      index: number;
      recipeName: string;
      aiImageUrl: string | null;
      promptHint: string;
    }> = [];
    meals.forEach((m, i) => {
      const slotOk = slots.includes(m.slot as PlanSlot);
      const dateOk = dates.includes(m.date);
      const filled = filledKeys.has(`${m.date}|${m.slot}`);
      if (m.recipe && slotOk && dateOk && !filled) {
        photoTargets.push({
          index: i,
          recipeName: m.recipe.name,
          aiImageUrl: m.recipe.image_url ?? null,
          promptHint: m.recipe.tags?.slice(0, 3).join(", ") ?? "",
        });
      }
    });
    const resolvedPhotos = await Promise.all(
      photoTargets.map((t) =>
        resolveRecipePhoto({
          recipeName: t.recipeName,
          aiImageUrl: t.aiImageUrl,
          promptHint: t.promptHint,
        }).catch(() => null),
      ),
    );
    const photoByIndex = new Map<number, string | null>();
    photoTargets.forEach((t, j) => {
      photoByIndex.set(t.index, resolvedPhotos[j]?.url ?? null);
    });

    const created: Array<{ date: string; slot: string; recipe_name: string }> = [];
    let skipped = existing.length;
    const entryIdByIndex = new Map<number, string>();
    const recipeIdByIndex = new Map<number, string>();

    for (let i = 0; i < meals.length; i++) {
      const m = meals[i];
      if (!dates.includes(m.date) || !slots.includes(m.slot as PlanSlot)) {
        continue;
      }
      if (filledKeys.has(`${m.date}|${m.slot}`)) {
        continue;
      }

      // Branch 1: leftover — points at an earlier insert in this batch.
      if (typeof m.is_leftover_of_index === "number") {
        const sourceIdx = m.is_leftover_of_index;
        if (sourceIdx >= i) continue; // forward refs not allowed
        const sourceEntryId = entryIdByIndex.get(sourceIdx);
        const sourceRecipeId = recipeIdByIndex.get(sourceIdx);
        if (!sourceEntryId || !sourceRecipeId) continue;

        await supabase.from("meal_plan_entries").insert({
          user_id: user.id,
          date: m.date,
          slot: m.slot,
          recipe_id: sourceRecipeId,
          status: "planned",
          is_leftover_of: sourceEntryId,
        });
        created.push({
          date: m.date,
          slot: m.slot,
          recipe_name: `(leftover) ${meals[sourceIdx]?.recipe?.name ?? "earlier meal"}`,
        });
        continue;
      }

      // Branch 2: fresh recipe.
      const r = m.recipe;
      if (!r) continue;
      const { data: recipeRow, error: recipeErr } = await supabase
        .from("recipes")
        .insert({
          owner_id: user.id,
          name: r.name,
          photo_url: photoByIndex.get(i) ?? null,
          source_url: null,
          ingredients_json: r.ingredients,
          steps_json: r.steps,
          kcal: r.kcal,
          protein: r.protein,
          carbs: r.carbs,
          fat: r.fat,
          time_min: r.time_min,
          servings: r.servings ?? 1 + family.length,
          family_notes_json: r.family_modifications ?? [],
          tips_json: r.tips ?? [],
          tags: [...new Set([...(r.tags ?? []), "auto-generated"])],
        })
        .select("id")
        .single();

      if (recipeErr || !recipeRow) continue;
      recipeIdByIndex.set(i, recipeRow.id);

      const { data: entryRow } = await supabase
        .from("meal_plan_entries")
        .insert({
          user_id: user.id,
          date: m.date,
          slot: m.slot,
          recipe_id: recipeRow.id,
          status: "planned",
        })
        .select("id")
        .single();
      if (entryRow) entryIdByIndex.set(i, entryRow.id);

      created.push({
        date: m.date,
        slot: m.slot,
        recipe_name: r.name,
      });
    }

    revalidatePath("/plan");
    revalidatePath("/today");
    revalidatePath("/recipes");
    revalidatePath("/shop");

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      slots: slots.length,
      days: dates.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Server error: ${(err as Error).message ?? "unknown"}` },
      { status: 500 },
    );
  }
}
