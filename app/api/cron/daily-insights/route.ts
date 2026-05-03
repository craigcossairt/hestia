import { NextResponse, type NextRequest } from "next/server";
import { generateText } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { getXai, MODELS } from "@/lib/ai/grok";
import { insightPrompt } from "@/lib/ai/prompts/insight";

export const maxDuration = 60;
export const runtime = "nodejs";

// Vercel Cron hits this once a day. For each onboarded user that doesn't
// already have a fresh insight today, generate one with prompt #8 (Noom-
// style behavioural nudge). Authenticated via the CRON_SECRET env var that
// Vercel passes as Bearer token.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const todayDate = new Date().toISOString().slice(0, 10);
  const todayStart = `${todayDate}T00:00:00`;

  // Pull every onboarded user.
  const { data: profiles, error: profilesErr } = await admin
    .from("profiles")
    .select(
      "id, name, goal, kcal_target, protein_target, dietary_restrictions",
    )
    .not("onboarded_at", "is", null);
  if (profilesErr) {
    return NextResponse.json({ error: profilesErr.message }, { status: 500 });
  }

  type Profile = {
    id: string;
    name: string | null;
    goal: string | null;
    kcal_target: number | null;
    protein_target: number | null;
    dietary_restrictions: string[];
  };
  const xai = (() => {
    try {
      return getXai();
    } catch {
      return null;
    }
  })();
  if (!xai) {
    return NextResponse.json(
      { error: "XAI_API_KEY not configured" },
      { status: 500 },
    );
  }

  const results: Array<{ user_id: string; status: string; error?: string }> = [];

  for (const profile of (profiles ?? []) as Profile[]) {
    if (!profile.kcal_target) {
      results.push({ user_id: profile.id, status: "skipped:no_target" });
      continue;
    }

    // Skip if today already has a daily_spot insight.
    const { data: existing } = await admin
      .from("insights")
      .select("id")
      .eq("user_id", profile.id)
      .eq("kind", "daily_spot")
      .gte("created_at", todayStart)
      .limit(1)
      .maybeSingle();
    if (existing) {
      results.push({ user_id: profile.id, status: "skipped:already_today" });
      continue;
    }

    // Hydrate context: today's logs + near-expiry pantry items.
    const [{ data: logs }, { data: pantry }] = await Promise.all([
      admin
        .from("meal_logs")
        .select("custom_name, kcal, protein, recipes:recipe_id(name)")
        .eq("user_id", profile.id)
        .gte("logged_at", todayStart)
        .order("logged_at", { ascending: false })
        .limit(8),
      admin
        .from("pantry_items")
        .select("name, expires_at")
        .eq("user_id", profile.id)
        .not("expires_at", "is", null)
        .lte(
          "expires_at",
          new Date(Date.now() + 4 * 86400_000).toISOString(),
        )
        .limit(8),
    ]);

    type LogRow = {
      custom_name: string | null;
      kcal: number | null;
      protein: number | null;
      recipes: { name: string } | null;
    };
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
      await admin.from("insights").insert({
        user_id: profile.id,
        kind: "daily_spot",
        body: text.trim(),
      });
      results.push({ user_id: profile.id, status: "generated" });
    } catch (err) {
      results.push({
        user_id: profile.id,
        status: "error",
        error: (err as Error).message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    summary: results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}),
    results,
  });
}
