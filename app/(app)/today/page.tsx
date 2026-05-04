import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { H, Body, Label, Mono, Ring, Bar } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  EmptyMealCard,
  LoggedSlotCard,
  LogAnythingButton,
  PlannedMealCard,
  RemoveLogButton,
} from "@/components/today/meal-card";
import { MemberSwitcher } from "@/components/family/member-switcher";
import { DateNavigator } from "@/components/today/date-navigator";
import { Greeting } from "@/components/today/greeting";
import { getProgram } from "@/lib/programs";
import type { FamilyMember } from "@/lib/family";

const SLOTS = [
  "breakfast",
  "lunch",
  "dinner",
  "dessert",
  "snack",
  "beverage",
] as const;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const viewAs = sp?.as ?? null;
  const date = sp?.date && isValidDate(sp.date) ? sp.date : todayStr();
  const isToday = date === todayStr();

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
  let userActiveProgramIds: string[] = [];
  let family: FamilyMember[] = [];
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
    slot: string | null;
    kcal: number | null;
    protein: number | null;
    recipe_id: string | null;
    recipes: { name: string } | null;
  };
  let logs: LogRow[] = [];

  let viewedMember: FamilyMember | null = null;
  let viewedScopeLabel: string | null = null;

  if (user && supabase) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "name, kcal_target, protein_target, carbs_target, fat_target, schedule_json, onboarded_at, active_programs, family_json",
      )
      .eq("id", user.id)
      .maybeSingle();
    if (!data?.onboarded_at) redirect("/onboard");

    const familyRaw =
      (data?.family_json as FamilyMember[] | null | undefined) ?? [];
    family = familyRaw.filter((m) => m.name?.trim());

    if (viewAs && viewAs !== "self") {
      viewedMember = family.find((m) => m.id === viewAs) ?? null;
      if (viewedMember) viewedScopeLabel = `for ${viewedMember.name}`;
    }

    if (viewedMember) {
      profile = {
        name: viewedMember.name,
        kcal_target: viewedMember.kcal_target ?? null,
        protein_target: viewedMember.protein_target ?? null,
        carbs_target: viewedMember.carbs_target ?? null,
        fat_target: viewedMember.fat_target ?? null,
        schedule_json:
          (viewedMember.schedule_json as Record<string, string> | null) ?? null,
      };
    } else {
      profile = data;
    }
    userActiveProgramIds =
      (data as { active_programs?: string[] | null }).active_programs ?? [];

    if (!viewedMember) {
      const { data: planRows } = await supabase
        .from("meal_plan_entries")
        .select(
          "id, slot, status, recipe_id, recipes:recipe_id(name, kcal, protein, photo_url)",
        )
        .eq("user_id", user.id)
        .eq("date", date);
      plan = (planRows ?? []) as unknown as PlanRow[];
    }

    let logQuery = supabase
      .from("meal_logs")
      .select(
        "id, custom_name, slot, kcal, protein, carbs, fat, recipe_id, recipes:recipe_id(name)",
      )
      .eq("user_id", user.id)
      .gte("logged_at", `${date}T00:00:00`)
      .lt("logged_at", `${date}T23:59:59`)
      .order("logged_at", { ascending: false });
    logQuery = viewedMember
      ? logQuery.eq("family_member_id", viewedMember.id)
      : logQuery.is("family_member_id", null);
    const { data: logRows } = await logQuery;
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
  }

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

  const logBySlot: Partial<Record<(typeof SLOTS)[number], LogRow>> = {};
  for (const log of logs) {
    if (
      log.slot &&
      (SLOTS as readonly string[]).includes(log.slot) &&
      !logBySlot[log.slot as (typeof SLOTS)[number]]
    ) {
      logBySlot[log.slot as (typeof SLOTS)[number]] = log;
    }
  }

  // Active programs to surface in the header. When viewing a member, show
  // the programs assigned to them; otherwise the user's own.
  const activeProgramsForView = (
    viewedMember
      ? (viewedMember.active_programs ?? [])
      : userActiveProgramIds
  )
    .map((id) => getProgram(id))
    .filter((p): p is NonNullable<ReturnType<typeof getProgram>> => !!p);

  const headerName = viewedMember ? viewedMember.name : name;

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-5xl mx-auto flex flex-col gap-10">
      {activeProgramsForView.length > 0 ? (
        <div className="flex items-center flex-wrap gap-2 -mb-4">
          <Sparkles size={14} strokeWidth={1.5} className="text-accent" />
          <span className="font-mono text-[10.5px] uppercase tracking-[1.4px] text-ink-3 mr-1">
            {viewedMember ? `${headerName}'s programs` : "Active"}
          </span>
          {activeProgramsForView.map((p) => (
            <Link
              key={p.id}
              href={`/programs/${p.id}`}
              className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-accent bg-accent-tint hover:bg-[color-mix(in_oklab,var(--color-accent)_12%,transparent)] transition-colors"
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: p.hero_color }}
              />
              <span className="font-sans text-[12px] text-ink font-medium">
                {p.name}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <DateNavigator date={date} />
          <MemberSwitcher
            selectedId={viewedMember?.id ?? null}
            members={family.map((m) => ({ id: m.id, name: m.name }))}
          />
        </div>
        <H size="xl" as="h1">
          {!isToday ? (
            <>{viewedMember ? `${headerName}` : "Looking back"}</>
          ) : viewedMember ? (
            <>Today, <span className="text-accent">{headerName}</span>.</>
          ) : (
            <Greeting name={headerName} />
          )}
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
              <LogAnythingButton
                familyMemberId={viewedMember?.id ?? null}
                scopeLabel={viewedScopeLabel ?? undefined}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Label>{viewedMember ? `${headerName}'s meals` : "today's meals"}</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SLOTS.map((slot) => {
            const entry = planBySlot[slot];
            const logged = logBySlot[slot];
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
            if (logged) {
              return (
                <LoggedSlotCard
                  key={slot}
                  logId={logged.id}
                  slot={slot}
                  time={time}
                  name={logged.recipes?.name ?? logged.custom_name ?? "logged meal"}
                  kcal={logged.kcal}
                  protein={logged.protein}
                />
              );
            }
            return (
              <EmptyMealCard
                key={slot}
                slot={slot}
                time={time}
                familyMemberId={viewedMember?.id ?? null}
                scopeLabel={viewedScopeLabel ?? undefined}
              />
            );
          })}
        </div>
      </section>

      {logs.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Label>logged {isToday ? "today" : "that day"}</Label>
          <ul className="flex flex-col rounded-card border border-ink-l overflow-hidden bg-card">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between gap-3 px-4 py-3 border-b border-ink-l/40 last:border-b-0"
              >
                <div className="flex flex-col flex-1 min-w-0">
                  <Body size="sm" className="text-ink truncate">
                    {log.recipes?.name ?? log.custom_name ?? "untitled meal"}
                  </Body>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                    {log.slot ?? "unsorted"}
                  </span>
                </div>
                <Mono className="text-ink-3 text-[12px] shrink-0">
                  {log.kcal ?? 0} kcal
                  {log.protein != null ? ` · ${log.protein}g protein` : ""}
                </Mono>
                <RemoveLogButton logId={log.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!user ? (
        <section className="border border-dashed border-ink-l rounded-card p-6">
          <Body size="sm" dim>
            You&apos;re viewing the demo Today screen unauthenticated. Configure
            Supabase + sign in to see your real targets and meals.
          </Body>
        </section>
      ) : null}
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
