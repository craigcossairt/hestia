import { type NextRequest } from "next/server";
import { streamObject } from "ai";
import { createClient } from "@/lib/supabase/server";
import { checkAiQuota } from "@/lib/ai/quota";
import {
  getModel,
  getModelOpts,
  getProviderOptions,
} from "@/lib/ai/provider";
import {
  PlanRefinementSchema,
  refinePlanPrompt,
} from "@/lib/ai/prompts/refine-plan";
import { buildProgramContext } from "@/lib/programs";
import type { FamilyMember } from "@/lib/family";
import type { PlanSlot } from "@/lib/ai/prompts/plan-week";

// Refines are usually small (1-3 new recipes), but a "regenerate the
// whole week as vegetarian" diff can rival a full plan. Use Vercel default.
export const maxDuration = 300;

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
  user_request: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as RequestBody | null;
  if (!body?.user_request || body.user_request.trim().length < 3) {
    return new Response(
      JSON.stringify({ error: "Tell Hestia what to adjust." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const quota = await checkAiQuota(supabase, user.id);
  if (!quota.ok && quota.response) return quota.response;

  const requestedWeek =
    body.week_start && isValidDate(body.week_start)
      ? new Date(`${body.week_start}T00:00:00`)
      : new Date();
  const start = startOfWeek(requestedWeek);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const [{ data: profile }, { data: pantry }, { data: planRows }] =
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
        .from("meal_plan_entries")
        .select(
          "id, date, slot, is_leftover_of, recipes:recipe_id(name, kcal)",
        )
        .eq("user_id", user.id)
        .gte("date", dates[0])
        .lte("date", dates[6]),
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

  type PlanRow = {
    id: string;
    date: string;
    slot: PlanSlot;
    is_leftover_of: string | null;
    recipes: { name: string; kcal: number | null } | null;
  };
  const currentPlan = ((planRows ?? []) as unknown as PlanRow[])
    .filter((r) => r.recipes != null)
    .map((r) => ({
      id: r.id,
      date: r.date,
      slot: r.slot,
      recipe_name: r.recipes!.name,
      recipe_kcal: r.recipes!.kcal,
      is_leftover_of: r.is_leftover_of,
    }));

  const result = streamObject({
    model: getModel("bulk"),
    schema: PlanRefinementSchema,
    // Refine generates a small diff (typically 1-3 new recipes). Bulk
    // search would add latency without much payoff — keep search off here.
    providerOptions: getProviderOptions({ disableSearch: true }),
    ...getModelOpts(),
    prompt: refinePlanPrompt({
      user_request: body.user_request.trim(),
      current_plan: currentPlan,
      week_dates: dates,
      goal: profile?.goal ?? null,
      protein_target: profile?.protein_target ?? null,
      dietary_restrictions: profile?.dietary_restrictions ?? [],
      household_allergies: householdAllergies,
      household_dislikes: householdDislikes,
      household_medical: householdMedical,
      pantry_hints: (pantry ?? []).map((p: { name: string }) => p.name),
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

  return result.toTextStreamResponse();
}
