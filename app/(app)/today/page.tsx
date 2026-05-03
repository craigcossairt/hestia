import { redirect } from "next/navigation";
import { H, Body, Label, Mono, Ring, Bar } from "@/components/ds";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { InsightCard } from "@/components/today/insight-card";
import { MealCard, EmptyMealCard } from "@/components/today/meal-card";

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

  // Allow visiting /today unauthenticated for demo, but show empty state.
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
  type PlanRow = {
    id: string;
    slot: string;
    status: string;
    recipes: { name: string; kcal: number | null; protein: number | null; photo_url: string | null } | null;
  };
  let plan: PlanRow[] = [];

  if (user && supabase) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "name, kcal_target, protein_target, carbs_target, fat_target, schedule_json, onboarded_at",
      )
      .eq("id", user.id)
      .maybeSingle();
    if (!data?.onboarded_at) redirect("/onboard");
    profile = data;

    const today = new Date().toISOString().slice(0, 10);
    const { data: planRows } = await supabase
      .from("meal_plan_entries")
      .select(
        "id, slot, status, recipes:recipe_id(name, kcal, protein, photo_url)",
      )
      .eq("user_id", user.id)
      .eq("date", today);
    plan = (planRows ?? []) as unknown as PlanRow[];

    const { data: logs } = await supabase
      .from("meal_logs")
      .select("kcal, protein, carbs, fat")
      .eq("user_id", user.id)
      .gte("logged_at", `${today}T00:00:00`)
      .lt("logged_at", `${today}T23:59:59`);
    totals = (logs ?? []).reduce(
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
      .select("id, body")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ins) insight = ins;
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

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-5xl mx-auto flex flex-col gap-10">
      {/* greeting */}
      <header className="flex flex-col gap-2">
        <Label>{DAY_FMT.format(now).toLowerCase()}</Label>
        <H size="xl" as="h1">
          {greet(now)}, {name}.
        </H>
      </header>

      {/* target + macros */}
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
        </div>
      </section>

      {/* meals */}
      <section className="flex flex-col gap-4">
        <Label>today&apos;s meals</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SLOTS.map((slot) => {
            const entry = planBySlot[slot];
            const time = schedule[slot];
            if (entry?.recipes) {
              return (
                <MealCard
                  key={slot}
                  slot={slot}
                  time={time}
                  name={entry.recipes.name}
                  kcal={entry.recipes.kcal}
                  protein={entry.recipes.protein}
                  status={entry.status as "planned" | "logged" | "skipped"}
                  href={`/recipes/${entry.id}`}
                  photoUrl={entry.recipes.photo_url}
                />
              );
            }
            return <EmptyMealCard key={slot} slot={slot} time={time} />;
          })}
        </div>
      </section>

      {/* insight */}
      {insight ? (
        <section>
          <InsightCard id={insight.id} body={insight.body} />
        </section>
      ) : !user ? (
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
