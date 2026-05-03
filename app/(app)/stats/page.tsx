import { redirect } from "next/navigation";
import { H, Body, Label, Card, Mono, Stat } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { WeekBars } from "@/components/stats/week-bars";
import { WeightChart } from "@/components/stats/weight-chart";

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short" });

function lastNDays(n: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (n - 1 - i));
    return {
      date: d.toISOString().slice(0, 10),
      weekday: WEEKDAY_FMT.format(d).toLowerCase(),
    };
  });
}

export default async function StatsPage() {
  const supabase = isSupabaseConfigured() ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, kcal_target, protein_target, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) redirect("/onboard");

  const days = lastNDays(7);
  const fromDay = days[0].date;
  const toDay = new Date();
  toDay.setHours(23, 59, 59, 999);
  const toIso = toDay.toISOString();

  // Fetch a wider window for the weight chart (last 90 days).
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000)
    .toISOString()
    .slice(0, 10);

  let weightsResData: Array<{ logged_at: string; value_kg: number }> | null = null;
  try {
    const weightsRes = await supabase
      .from("weight_logs")
      .select("logged_at, value_kg")
      .eq("user_id", user.id)
      .gte("logged_at", `${ninetyDaysAgo}T00:00:00`)
      .order("logged_at", { ascending: true });
    weightsResData = (weightsRes.data ?? null) as
      | Array<{ logged_at: string; value_kg: number }>
      | null;
  } catch {
    // weight_logs table may not exist yet — ignore
  }

  const [logsRes, planRes] = await Promise.all([
    supabase
      .from("meal_logs")
      .select("logged_at, kcal, protein")
      .eq("user_id", user.id)
      .gte("logged_at", `${fromDay}T00:00:00`)
      .lte("logged_at", toIso),
    supabase
      .from("meal_plan_entries")
      .select("date, status")
      .eq("user_id", user.id)
      .gte("date", fromDay)
      .lte("date", days[days.length - 1].date),
  ]);

  const weightPoints = (weightsResData ?? []).map((w) => ({
    date: w.logged_at,
    value_kg: w.value_kg,
  }));

  type LogRow = { logged_at: string; kcal: number | null; protein: number | null };
  const logs = (logsRes.data ?? []) as LogRow[];

  const dayPoints = days.map((d) => {
    const dayLogs = logs.filter((l) => l.logged_at.startsWith(d.date));
    return {
      ...d,
      kcal: dayLogs.reduce((a, l) => a + (l.kcal ?? 0), 0),
      protein: dayLogs.reduce((a, l) => a + (l.protein ?? 0), 0),
    };
  });

  const daysWithLogs = dayPoints.filter((d) => d.kcal > 0).length;
  const avgKcal = daysWithLogs
    ? Math.round(
        dayPoints.filter((d) => d.kcal > 0).reduce((a, d) => a + d.kcal, 0) /
          daysWithLogs,
      )
    : 0;
  const avgProtein = daysWithLogs
    ? Math.round(
        dayPoints.filter((d) => d.kcal > 0).reduce((a, d) => a + d.protein, 0) /
          daysWithLogs,
      )
    : 0;

  type PlanRow = { date: string; status: string };
  const planEntries = (planRes.data ?? []) as PlanRow[];
  const planned = planEntries.length;
  const logged = planEntries.filter((p) => p.status === "logged").length;
  const adherence = planned > 0 ? Math.round((logged / planned) * 100) : 0;

  // Streak: consecutive days (back from today) with at least one logged meal.
  let streak = 0;
  for (let i = dayPoints.length - 1; i >= 0; i--) {
    if (dayPoints[i].kcal > 0) streak++;
    else break;
  }

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-5xl mx-auto flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <Label>last 7 days</Label>
        <H size="xl" as="h1">
          Stats
        </H>
        <Body size="lg" dim>
          A read-only view of how this week landed.
        </Body>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="avg kcal" value={avgKcal || "—"} sub={`target ${profile.kcal_target ?? 0}`} />
        <KpiCard label="avg protein" value={avgProtein ? `${avgProtein}g` : "—"} sub={`target ${profile.protein_target ?? 0}g`} />
        <KpiCard label="days logged" value={`${daysWithLogs}/7`} sub={daysWithLogs >= 5 ? "consistent" : "build the habit"} />
        <KpiCard label="adherence" value={planned ? `${adherence}%` : "—"} sub={planned ? `${logged} of ${planned} planned` : "no plan yet"} />
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <Card className="p-5 flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <Label>kcal per day</Label>
            <Mono className="text-ink-3 text-[11px]">streak {streak}d</Mono>
          </div>
          <WeekBars days={dayPoints} target={profile.kcal_target ?? 0} metric="kcal" />
        </Card>
        <Card className="p-5 flex flex-col gap-4">
          <Label>protein per day</Label>
          <WeekBars days={dayPoints} target={profile.protein_target ?? 0} metric="protein" />
        </Card>
      </section>

      <section>
        <Card className="p-5 flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <Label>weight (last 90 days)</Label>
            <Mono className="text-ink-3 text-[11px]">log on Me</Mono>
          </div>
          <WeightChart points={weightPoints} />
        </Card>
      </section>

      {dayPoints.every((d) => d.kcal === 0) ? (
        <Card className="p-6 flex flex-col gap-2 border-dashed">
          <Label>no data yet</Label>
          <Body size="sm" dim>
            Log a meal on Today and stats will start filling in. Hestia keeps
            it lightweight — no streaks-as-pressure, just a quiet read of the
            week.
          </Body>
        </Card>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
}) {
  return (
    <Card className="p-4">
      <Stat label={label} value={value} sub={sub} />
    </Card>
  );
}
