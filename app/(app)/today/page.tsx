import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { H, Body, Label, Mono, Ring, Bar } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { InsightSlot } from "@/components/today/insight-slot";
import {
  PlannedMealCard,
  EmptyMealCard,
  LogAnythingButton,
} from "@/components/today/meal-card";
import { getProgram } from "@/lib/programs";

const SLOTS = ["breakfast", "lunch", "dinner"] as const;

function greet(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

export default async function TodayPage() {
  const supabase = isSupabaseConfigured() ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  let profile: {
    name: string | null;
    kcal_target: number | null;
    protein_target: number | null;
    carbs_target: number | null;
    fat_target: number | null;
    schedule_json: Record<string, string> | null;
  } | null = null;
  let totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let insight: { id: string; body: string } | null = null;
  let insightHoursOld: number | null = null;
  let activeProgramId: string | null = null;
  type PlanRow = {
    id: string;
    slot: string;
    status: string;
    recipe_id: string | null;
    recipes: {
      name: string;
      kcal: number | null;
      protein: number | null;
      photo_url: string | null;
    } | null;
  };
  let plan: PlanRow[] = [];
  type LogRow = {
    id: string;
    custom_name: string | null;
    kcal: number | null;
    protein: number | null;
    recipe_id: string | null;
    recipes: { name: string } | null;
  };
  let logs: LogRow[] = [];

  if (user && supabase) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "name, kcal_target, protein_target, carbs_target, fat_target, schedule_json, onboarded_at, active_program",
      )
      .eq("id", user.id)
      .maybeSingle();
    if (!data?.onboarded_at) redirect("/onboard");
    profile = data;
    activeProgramId =
      (data as { active_program?: string | null }).active_program ?? null;

    const today = new Date().toISOString().slice(0, 10);
    const { data: planRows } = await supabase
      .from("meal_plan_entries")
      .select(
        "id, slot, status, recipe_id, recipes:recipe_id(name, kcal, protein, photo_url)",
      )
      .eq("user_id", user.id)
      .eq("date", today);
    plan = (planRows ?? []) as unknown as PlanRow[];

    const { data: logRows } = await supabase
      .from("meal_logs")
      .select("id, custom_name, kcal, protein, carbs, fat, recipe_id, recipes:recipe_id(name)")
      .eq("user_id", user.id)
      .gte("logged_at", `${today}T00:00:00`)
      .lt("logged_at", `${today}T23:59:59`)
      .order("logged_at", { ascending: false });
    logs = (logRows ?? []) as unknown as LogRow[];
    totals = (logRows ?? []).reduce(
      (acc, r) => ({
        kcal: acc.kcal + (r.kcal ?? 0),
        protein: acc.protein + (r.protein ?? 0),
        carbs: acc.carbs + (r.carbs ?? 0),
        fat: acc.fat + (r.fat ?? 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );

    const { data: ins } = await supabase
      .from("insights")
      .select("id, body, created_at")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ins) {
      insight = { id: ins.id, body: ins.body };
      insightHoursOld =
        (Date.now() - new Date(ins.created_at).getTime()) / (1000 * 60 * 60);
    }
  }

  const now = new Date();
  const name = profile?.name?.split(" ")[0] ?? "there";
  const kcalTarget = profile?.kcal_target ?? 2140;
  const proteinTarget = profile?.protein_target ?? 140;
  const carbsTarget = profile?.carbs_target ?? 220;
  const fatTarget = profile?.fat_target ?? 70;
  const schedule = profile?.schedule_json ?? {
    breakfast: "08:00",
    lunch: "12:30",
    dinner: "19:00",
  };
  const planBySlot = Object.fromEntries(
    plan.map((p) => [p.slot, p]),
  ) as Record<(typeof SLOTS)[number], PlanRow | undefined>;
  const activeProgram = activeProgramId ? getProgram(activeProgramId) : null;

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-5xl mx-auto flex flex-col gap-10">
      {activeProgram ? (
        <Link
          href={`/programs/${activeProgram.id}`}
          className="flex items-center gap-3 px-4 py-2.5 rounded-card border border-accent bg-accent-tint hover:bg-[color-mix(in_oklab,var(--color-accent)_12%,transparent)] transition-colors -mb-4 self-start"
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: activeProgram.hero_color }}
          />
          <Sparkles size={14} strokeWidth={1.5} className="text-accent" />
          <span className="font-mono text-[10.5px] uppercase tracking-[1.4px] text-ink-3">
            active program
          </span>
          <span className="font-sans text-[13px] text-ink font-medium">
            {activeProgram.name}
          </span>
          <span className="text-ink-3 text-[12px]">→</span>
        </Link>
      ) : null}

      <header className="flex flex-col gap-2">
        <Label>{DAY_FMT.format(now).toLowerCase()}</Label>
        <H size="xl" as="h1">
          {greet(now)}, {name}.
        </H>
      </header>

      <section className="grid md:grid-cols-[auto_1fr] gap-10 items-center">
        <Ring
          value={Math.min(1, totals.kcal / kcalTarget)}
          size={200}
          stroke={10}
          label={totals.kcal.toLocaleString()}
          sub={`of ${kcalTarget.toLocaleString()} kcal`}
        />
        <div className="flex flex-col gap-4 w-full">
          <MacroRow label="protein" value={totals.protein} target={proteinTarget} unit="g" />
          <MacroRow label="carbs" value={totals.carbs} target={carbsTarget} unit="g" />
          <MacroRow label="fat" value={totals.fat} target={fatTarget} unit="g" />
          {user ? (
            <div className="pt-2">
              <LogAnythingButton />
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Label>today&apos;s meals</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SLOTS.map((slot) => {
            const entry = planBySlot[slot];
            const time = schedule[slot];
            if (entry?.recipes && entry.recipe_id) {
              return (
                <PlannedMealCard
                  key={slot}
                  planEntryId={entry.id}
                  slot={slot}
                  time={time}
                  name={entry.recipes.name}
                  kcal={entry.recipes.kcal}
                  protein={entry.recipes.protein}
                  status={entry.status as "planned" | "logged" | "skipped"}
                  recipeId={entry.recipe_id}
                  photoUrl={entry.recipes.photo_url}
                />
              );
            }
            return <EmptyMealCard key={slot} slot={slot} time={time} />;
          })}
        </div>
      </section>

      {logs.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Label>logged today</Label>
          <ul className="flex flex-col rounded-card border border-ink-l overflow-hidden bg-card">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between px-4 py-3 border-b border-ink-l/40 last:border-b-0"
              >
                <Body size="sm" className="text-ink">
                  {log.recipes?.name ?? log.custom_name ?? "untitled meal"}
                </Body>
                <Mono className="text-ink-3 text-[12px]">
                  {log.kcal ?? 0} kcal
                  {log.protein != null ? ` · ${log.protein}g protein` : ""}
                </Mono>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {user ? (
        <section>
          <InsightSlot insight={insight} hoursOld={insightHoursOld} />
        </section>
      ) : (
        <section className="border border-dashed border-ink-l rounded-card p-6">
          <Body size="sm" dim>
            You&apos;re viewing the demo Today screen unauthenticated. Configure
            Supabase + sign in to see your real targets and meals.
          </Body>
        </section>
      )}
    </div>
  );
}

function MacroRow({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-baseline">
        <Label>{label}</Label>
        <Mono className="text-ink-2 text-[12px]">
          {value} / {target} {unit}
        </Mono>
      </div>
      <Bar value={value / Math.max(1, target)} />
    </div>
  );
}
