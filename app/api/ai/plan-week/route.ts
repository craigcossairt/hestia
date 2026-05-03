import { NextResponse, type NextRequest } from "next/server";
import { generateObject } from "ai";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getXai, MODELS } from "@/lib/ai/grok";
import { PlanWeekSchema, planWeekPrompt } from "@/lib/ai/prompts/plan-week";
import { getProgram } from "@/lib/programs";
import type { FamilyMember } from "@/lib/family";

export const maxDuration = 60;

function startOfWeek(d: Date): Date {
  // Monday-anchored, matches /plan page logic.
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Hydrate context.
  const [{ data: profile }, { data: pantry }, { data: recent }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "goal, protein_target, dietary_restrictions, active_program, family_json",
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("pantry_items").select("name").eq("user_id", user.id).limit(40),
      supabase
        .from("recipes")
        .select("name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const activeProgramId =
    (profile as { active_program?: string | null } | null)?.active_program;
  const program = activeProgramId ? getProgram(activeProgramId) : null;
  const family =
    ((profile as { family_json?: FamilyMember[] | null } | null)?.family_json ?? [])
      .filter((f) => f.name && f.name.trim().length > 0);

  const familySummary = family.length
    ? family
        .map(
          (f) =>
            `${f.name} (${f.age}${f.dietary_restrictions.length ? ", " + f.dietary_restrictions.join("/") : ""})`,
        )
        .join(", ")
    : null;

  // Generate 7 dinners.
  let dinners;
  try {
    const xai = getXai();
    const result = await generateObject({
      model: xai(MODELS.fast),
      schema: PlanWeekSchema,
      prompt: planWeekPrompt({
        goal: profile?.goal ?? null,
        protein_target: profile?.protein_target ?? null,
        dietary_restrictions: profile?.dietary_restrictions ?? [],
        pantry_hints: (pantry ?? []).map((p: { name: string }) => p.name),
        recent_recipe_names: (recent ?? []).map((r: { name: string }) => r.name),
        active_program_context: program?.coach_context ?? null,
        family_summary: familySummary,
      }),
    });
    dinners = result.object.dinners;
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }

  // Compute the 7 days: start of current week + 6.
  const start = startOfWeek(new Date());
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  // Find which dinner slots are already filled — skip those.
  const { data: existingPlans } = await supabase
    .from("meal_plan_entries")
    .select("date")
    .eq("user_id", user.id)
    .eq("slot", "dinner")
    .in("date", dates);
  const filled = new Set(
    ((existingPlans ?? []) as Array<{ date: string }>).map((p) => p.date),
  );

  // Insert new recipes (one per day) + plan entries for empty slots.
  const created: Array<{ date: string; recipe_name: string }> = [];
  let skipped = 0;

  for (let i = 0; i < 7; i++) {
    const date = dates[i];
    if (filled.has(date)) {
      skipped++;
      continue;
    }
    const r = dinners[i];

    const { data: recipeRow, error: recipeErr } = await supabase
      .from("recipes")
      .insert({
        owner_id: user.id,
        name: r.name,
        photo_url: null,
        source_url: null,
        ingredients_json: r.ingredients,
        steps_json: r.steps,
        kcal: r.kcal,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        time_min: r.time_min,
        tags: [...new Set([...(r.tags ?? []), "auto-generated"])],
      })
      .select("id")
      .single();

    if (recipeErr || !recipeRow) continue;

    await supabase.from("meal_plan_entries").insert({
      user_id: user.id,
      date,
      slot: "dinner",
      recipe_id: recipeRow.id,
      status: "planned",
    });
    created.push({ date, recipe_name: r.name });
  }

  revalidatePath("/plan");
  revalidatePath("/today");
  revalidatePath("/recipes");
  revalidatePath("/shop");

  return NextResponse.json({
    ok: true,
    created,
    skipped,
  });
}
