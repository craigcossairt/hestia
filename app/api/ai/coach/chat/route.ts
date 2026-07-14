import { type NextRequest, NextResponse } from "next/server";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkAiQuota } from "@/lib/ai/quota";
import { getModel } from "@/lib/ai/provider";
import { coachSystemPrompt } from "@/lib/ai/prompts/coach";
import { buildProgramContext } from "@/lib/programs";
import type { FamilyMember } from "@/lib/family";

export const maxDuration = 30;

const Body = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        role: z.enum(["user", "assistant", "system"]),
        // AI SDK v6 UIMessage uses `parts`; older shapes may use `content`.
        parts: z.array(z.record(z.string(), z.unknown())).optional(),
        content: z.unknown().optional(),
      }),
    )
    .max(50),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body: messages must be an array of at most 50 well-formed items" },
      { status: 400 },
    );
  }
  const messages = parsed.data.messages as UIMessage[];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quota = await checkAiQuota(supabase, user.id);
  if (!quota.ok && quota.response) return quota.response;

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: profile }, { data: logs }, { data: pantry }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "name, goal, kcal_target, protein_target, carbs_target, fat_target, dietary_restrictions, allergies, disliked_foods, medical_conditions, active_programs, family_json",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("meal_logs")
      .select("custom_name, recipes:recipe_id(name)")
      .eq("user_id", user.id)
      .gte("logged_at", `${today}T00:00:00`)
      .order("logged_at", { ascending: false })
      .limit(10),
    supabase.from("pantry_items").select("name").eq("user_id", user.id).limit(40),
  ]);

  type LogRow = { custom_name: string | null; recipes: { name: string } | null };
  const recent_meals = ((logs ?? []) as unknown as LogRow[])
    .map((l) => l.recipes?.name ?? l.custom_name ?? "")
    .filter(Boolean);
  const pantry_highlights = (pantry ?? []).map((p: { name: string }) => p.name);

  const userProgramIds =
    ((profile as { active_programs?: string[] | null } | null)?.active_programs) ??
    [];
  const familyRaw =
    ((profile as { family_json?: FamilyMember[] | null } | null)?.family_json) ??
    [];
  const family = familyRaw.filter((f) => f.name && f.name.trim().length > 0);

  const programContext = buildProgramContext({
    userProgramIds,
    members: family,
  });

  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(messages);
  } catch (err) {
    console.warn("coach/chat: convertToModelMessages failed", err);
    return NextResponse.json(
      { error: "Invalid message payload." },
      { status: 400 },
    );
  }

  const result = streamText({
    model: getModel("fast"),
    system: coachSystemPrompt({
      name: profile?.name ?? null,
      goal: profile?.goal ?? null,
      kcal_target: profile?.kcal_target ?? null,
      protein_target: profile?.protein_target ?? null,
      carbs_target: profile?.carbs_target ?? null,
      fat_target: profile?.fat_target ?? null,
      dietary_restrictions: profile?.dietary_restrictions ?? [],
      allergies: profile?.allergies ?? [],
      disliked_foods: profile?.disliked_foods ?? [],
      medical_conditions: profile?.medical_conditions ?? [],
      recent_meals,
      pantry_highlights,
      active_program_context: programContext,
      family: family.map((f) => ({
        name: f.name,
        age: f.age,
        dietary_restrictions: f.dietary_restrictions ?? [],
        allergies: f.allergies ?? [],
        disliked_foods: f.disliked_foods ?? [],
        medical_conditions: f.medical_conditions ?? [],
        notes: f.notes,
      })),
    }),
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}
