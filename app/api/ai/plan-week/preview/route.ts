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
  PlanWeekSchema,
  planWeekPrompt,
  type PlanSlot,
} from "@/lib/ai/prompts/plan-week";
import { buildProgramContext } from "@/lib/programs";
import type { FamilyMember } from "@/lib/family";

// Streams the AI's plan as it's generated. The client renders meal cards
// progressively; once the stream completes, the client POSTs the final
// result to /save for photo resolution + DB writes.
//
// Photos and DB inserts intentionally do NOT happen here — the goal is to
// keep this endpoint short-lived so the client sees content as soon as
// possible.

// 21 recipes generated sequentially can run 90-180s of model output;
// 300s is Vercel's default function timeout — give the route headroom.
export const maxDuration = 300;

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
  // When true, planner skips reading existing entries (the save route still
  // wipes them just before insert).
  regenerate?: boolean;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as RequestBody | null;
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

  const slots: PlanSlot[] = [...REQUIRED_SLOTS];
  if (body?.include_snack) slots.push("snack");
  if (body?.include_dessert) slots.push("dessert");
  if (body?.include_beverage) slots.push("beverage");

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

  // Existing (date, slot) pairs the AI should NOT regenerate. When
  // regenerate=true, hide these so the AI fills the whole week (the save
  // route does the actual delete-then-insert).
  let existing: Array<{ date: string; slot: PlanSlot }> = [];
  if (!body?.regenerate) {
    const { data: existingPlans } = await supabase
      .from("meal_plan_entries")
      .select("date, slot")
      .eq("user_id", user.id)
      .gte("date", dates[0])
      .lte("date", dates[6])
      .in("slot", slots);
    existing = (
      (existingPlans ?? []) as Array<{ date: string; slot: PlanSlot }>
    ).filter((e) => slots.includes(e.slot));
  }

  const result = streamObject({
    model: getModel("bulk"),
    schema: PlanWeekSchema,
    // Disable search for the bulk plan generator. With auto-search the
    // model issues a search per recipe BEFORE streaming any tokens, which
    // can stack 60+ seconds of dead time. The photo chain still has Brave
    // + Pexels as fast/free fallbacks. Single-recipe routes keep search
    // on (one search, much shorter).
    providerOptions: getProviderOptions({ disableSearch: true }),
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

  return result.toTextStreamResponse();
}
