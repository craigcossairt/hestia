import { redirect } from "next/navigation";
import { H, Body, Label, Card, Mono, Stat } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { WeekBars } from "@/components/stats/week-bars";
import { WeightChart } from "@/components/stats/weight-chart";
import { MemberSwitcher } from "@/components/family/member-switcher";
import type { FamilyMember } from "@/lib/family";

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

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const sp = await searchParams;
  const viewAs = sp?.as ?? null;

  const supabase = isSupabaseConfigured() ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "name, kcal_target, protein_target, family_json, onboarded_at",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) redirect("/onboard");

  const family =
    ((profile?.family_json as FamilyMember[] | null | undefined) ?? []).filter(
      (m) => m.name?.trim(),
    );

  const viewedMember =
    viewAs && viewAs !== "self"
      ? (family.find((m) => m.id === viewAs) ?? null)
      : null;

  const subjectName = viewedMember?.name ?? profile.name ?? "you";
  const subjectKcalTarget =
    viewedMember?.kcal_target ?? profile.kcal_target ?? 0;
  const subjectProteinTarget =
    viewedMember?.protein_target ?? profile.protein_target ?? 0;

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
    let query = supabase
      .from("weight_logs")
      .select("logged_at, value_kg")
      .eq("user_id", user.id)
      .gte("logged_at", `${ninetyDaysAgo}T00:00:00`)
      .order("logged_at", { ascending: true });
    query = viewedMember
      ? query.eq("family_member_id", viewedMember.id)
      : query.is("family_member_id", null);
    const weightsRes = await query;
    weightsResData = (weightsRes.data ?? null) as
      | Array<{ logged_at: string; value_kg: number }>
      | null;
  } catch {
    // weight_logs table or family_member_id column may not exist yet — ignore
  }

  // Grocery spend over the same window. Household-level (no member scope) —
  // we don't track per-person grocery contributions.
  let weeklySpendCents = 0;
  let monthlySpendCents = 0;
  let recentTripCount = 0;
  if (!viewedMember) {
    try {
      const sinceMonth = new Date();
      sinceMonth.setDate(sinceMonth.getDate() - 30);
      const { data: spendRows } = await supabase
        .from("grocery_purchases")
        .select("amount_cents, purchased_at")
        .eq("user_id", user.id)
        .gte("purchased_at", sinceMonth.toISOString())
        .order("purchased_at", { ascending: false });
      const rows = (spendRows ?? []) as Array<{
        amount_cents: number;
        purchased_at: string;
      }>;
      const sevenAgo = new Date();
      sevenAgo.setDate(sevenAgo.getDate() - 7);
      const sevenAgoIso = sevenAgo.toISOString();
      for (const row of rows) {
        monthlySpendCents += row.amount_cents ?? 0;
        if (row.purchased_at >= sevenAgoIso) {
          weeklySpendCents += row.amount_cents ?? 0;
          recentTripCount += 1;
        }
      }
    } catch {
      // grocery_purchases may not exist yet — leave totals at 0
    }
  }

  let logsQuery = supabase
    .from("meal_logs")
    .select("logged_at, kcal, protein")
    .eq("user_id", user.id)
    .gte("logged_at", `${fromDay}T00:00:00`)
    .lte("logged_at", toIso);
  logsQuery = viewedMember
    ? logsQuery.eq("family_member_id", viewedMember.id)
    : logsQuery.is("family_member_id", null);

  // Plan rows are household-level — only meaningful when viewing self.
  const [logsRes, planRes] = await Promise.all([
    logsQuery,
    viewedMember
      ? Promise.resolve({ data: [] as Array<{ date: string; status: string }> })
      : supabase
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
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Label>last 7 days</Label>
          <MemberSwitcher
            selectedId={viewedMember?.id ?? null}
            members={family.map((m) => ({ id: m.id, name: m.name }))}
          />
        </div>
        <H size="xl" as="h1">
          {viewedMember ? (
            <><span className="text-accent">{subjectName}</span>&apos;s stats</>
          ) : (
            <>Stats</>
          )}
        </H>
        <Body size="lg" dim>
          {viewedMember
            ? `A read-only view of ${subjectName}'s last 7 days.`
            : "A read-only view of how this week landed."}
        </Body>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="avg kcal" value={avgKcal || "—"} sub={`target ${subjectKcalTarget}`} />
        <KpiCard
          label="avg protein"
          value={avgProtein ? `${avgProtein}g` : "—"}
          sub={`target ${subjectProteinTarget}g`}
        />
        <KpiCard
          label="days logged"
          value={`${daysWithLogs}/7`}
          sub={daysWithLogs >= 5 ? "consistent" : "build the habit"}
        />
        {viewedMember ? null : (
          <KpiCard
            label="adherence"
            value={planned ? `${adherence}%` : "—"}
            sub={planned ? `${logged} of ${planned} planned` : "no plan yet"}
          />
        )}
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <Card className="p-5 flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <Label accent>kcal per day</Label>
            <Mono className="text-ink-3 text-[11px]">streak {streak}d</Mono>
          </div>
          <WeekBars days={dayPoints} target={subjectKcalTarget} metric="kcal" />
        </Card>
        <Card className="p-5 flex flex-col gap-4">
          <Label accent>protein per day</Label>
          <WeekBars days={dayPoints} target={subjectProteinTarget} metric="protein" />
        </Card>
      </section>

      <section>
        <Card className="p-5 flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <Label accent>weight (last 90 days)</Label>
            <Mono className="text-ink-3 text-[11px]">
              {viewedMember ? `log on /family/${viewedMember.id}` : "log on Me"}
            </Mono>
          </div>
          <WeightChart points={weightPoints} />
        </Card>
      </section>

      {viewedMember ? null : (
        <section>
          <Card className="p-5 flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <Label accent>grocery spend</Label>
              <Mono className="text-ink-3 text-[11px]">
                household · log on Shop
              </Mono>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <SpendTile
                label="this week"
                value={
                  weeklySpendCents
                    ? `$${(weeklySpendCents / 100).toFixed(0)}`
                    : "—"
                }
                sub={recentTripCount ? `${recentTripCount} trip${recentTripCount === 1 ? "" : "s"}` : "no trips logged"}
              />
              <SpendTile
                label="last 30 days"
                value={
                  monthlySpendCents
                    ? `$${(monthlySpendCents / 100).toFixed(0)}`
                    : "—"
                }
                sub={
                  monthlySpendCents
                    ? `~$${(monthlySpendCents / 100 / 30).toFixed(2)} / day`
                    : "log a trip to start"
                }
              />
              <SpendTile
                label="weekly avg"
                value={
                  monthlySpendCents
                    ? `$${(monthlySpendCents / 100 / 4.3).toFixed(0)}`
                    : "—"
                }
                sub={
                  monthlySpendCents
                    ? "rolling 30-day average"
                    : "—"
                }
              />
            </div>
          </Card>
        </section>
      )}

      {dayPoints.every((d) => d.kcal === 0) ? (
        <Card className="p-6 flex flex-col gap-2 border-dashed">
          <Label>no data yet</Label>
          <Body size="sm" dim>
            {viewedMember
              ? `Log a meal on Today (with ${subjectName} selected) and stats will start filling in.`
              : "Log a meal on Today and stats will start filling in. Hestia keeps it lightweight — no streaks-as-pressure, just a quiet read of the week."}
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

function SpendTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-thumb bg-paper-2/60">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
        {label}
      </span>
      <Mono className="text-ink text-[20px] font-medium">{value}</Mono>
      <span className="font-sans text-[11px] text-ink-3">{sub}</span>
    </div>
  );
}
