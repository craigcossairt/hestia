import { type NextRequest } from "next/server";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { getXai, MODELS } from "@/lib/ai/grok";
import { coachSystemPrompt } from "@/lib/ai/prompts/coach";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: profile }, { data: logs }, { data: pantry }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "name, goal, kcal_target, protein_target, carbs_target, fat_target, dietary_restrictions",
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

  const xai = getXai();
  const result = streamText({
    model: xai(MODELS.fast),
    system: coachSystemPrompt({
      name: profile?.name ?? null,
      goal: profile?.goal ?? null,
      kcal_target: profile?.kcal_target ?? null,
      protein_target: profile?.protein_target ?? null,
      carbs_target: profile?.carbs_target ?? null,
      fat_target: profile?.fat_target ?? null,
      dietary_restrictions: profile?.dietary_restrictions ?? [],
      recent_meals,
      pantry_highlights,
    }),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
