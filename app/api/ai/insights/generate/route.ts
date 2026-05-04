import { NextResponse, type NextRequest } from "next/server";
import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { checkAiQuota } from "@/lib/ai/quota";
import { getXai, MODELS } from "@/lib/ai/grok";
import { insightPrompt } from "@/lib/ai/prompts/insight";

// Generate a fresh "Hestia spotted" insight for the current user using
// today's logs + plan + pantry as context. Inserts the row and returns it.
export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quota = await checkAiQuota(supabase, user.id);
  if (!quota.ok && quota.response) return quota.response;

  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: profile },
    { data: logs },
    { data: pantry },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, goal, kcal_target, protein_target")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("meal_logs")
      .select("custom_name, kcal, protein, recipe_id, recipes:recipe_id(name)")
      .eq("user_id", user.id)
      .gte("logged_at", `${today}T00:00:00`)
      .lt("logged_at", `${today}T23:59:59`)
      .order("logged_at", { ascending: false })
      .limit(8),
    supabase
      .from("pantry_items")
      .select("name, expires_at")
      .eq("user_id", user.id)
      .not("expires_at", "is", null)
      .lte("expires_at", new Date(Date.now() + 4 * 86400_000).toISOString())
      .limit(8),
  ]);

  if (!profile?.kcal_target) {
    return NextResponse.json({ error: "Profile not configured" }, { status: 412 });
  }

  type LogRow = { custom_name: string | null; kcal: number | null; protein: number | null; recipes: { name: string } | null };
  const recentMeals = ((logs ?? []) as unknown as LogRow[])
    .map((l) => l.recipes?.name ?? l.custom_name ?? "")
    .filter(Boolean);
  const totals = ((logs ?? []) as unknown as LogRow[]).reduce(
    (acc, l) => ({
      kcal: acc.kcal + (l.kcal ?? 0),
      protein: acc.protein + (l.protein ?? 0),
    }),
    { kcal: 0, protein: 0 },
  );
  const pantryHighlights = (pantry ?? [])
    .map((p: { name: string }) => p.name)
    .slice(0, 6);

  try {
    const xai = getXai();
    const { text } = await generateText({
      model: xai(MODELS.fast),
      prompt: insightPrompt({
        name: profile.name,
        goal: profile.goal ?? "maintain",
        kcalTarget: profile.kcal_target,
        kcalLoggedToday: totals.kcal,
        proteinTarget: profile.protein_target ?? 0,
        proteinLoggedToday: totals.protein,
        recentMeals,
        pantryHighlights,
      }),
    });

    const body = text.trim();
    const { data: inserted, error } = await supabase
      .from("insights")
      .insert({ user_id: user.id, kind: "daily_spot", body })
      .select("id, body")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(inserted);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
