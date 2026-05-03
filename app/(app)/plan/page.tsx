import { H, Body, Label, Mono, Stat } from "@/components/ds";
import { createClient } from "@/lib/supabase/server";
import { PlanGrid, type PlanCellEntry } from "@/components/plan/plan-grid";
import { GenerateWeekButton } from "@/components/plan/generate-week-button";
import type { Slot } from "@/lib/types/database";

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });

function startOfWeek(d: Date): Date {
  // Monday-anchored
  const day = d.getDay(); // 0 = Sun
  const diff = (day === 0 ? -6 : 1 - day);
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function nextDays(start: Date, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      weekday: WEEKDAY.format(d).toLowerCase(),
      dayNum: String(d.getDate()),
    };
  });
}

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const start = startOfWeek(new Date());
  const days = nextDays(start, 7);
  const dateRange = { from: days[0].date, to: days[6].date };

  let entries: Record<string, Record<Slot, PlanCellEntry | undefined>> = {};
  let weekStats = { kcal: 0, planned: 0 };

  if (user) {
    const { data } = await supabase
      .from("meal_plan_entries")
      .select(
        "id, date, slot, recipes:recipe_id(name, kcal, photo_url)",
      )
      .eq("user_id", user.id)
      .gte("date", dateRange.from)
      .lte("date", dateRange.to);

    type Row = {
      id: string;
      date: string;
      slot: Slot;
      recipes: { name: string; kcal: number | null; photo_url: string | null } | null;
    };
    const rows = (data ?? []) as unknown as Row[];

    for (const row of rows) {
      const cell: PlanCellEntry | undefined = row.recipes
        ? {
            id: row.id,
            recipeName: row.recipes.name,
            kcal: row.recipes.kcal,
            photoUrl: row.recipes.photo_url,
          }
        : undefined;
      if (!entries[row.date])
        entries[row.date] = {} as Record<Slot, PlanCellEntry | undefined>;
      entries[row.date][row.slot] = cell;
      if (row.recipes?.kcal) weekStats.kcal += row.recipes.kcal;
      if (cell) weekStats.planned += 1;
    }
  }

  const avgKcal = weekStats.planned ? Math.round(weekStats.kcal / 7) : 0;

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-6xl mx-auto flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Label>this week</Label>
        <H size="xl" as="h1">
          Plan
        </H>
        <Body size="lg" dim>
          Tap any slot to assign a recipe. Hover the card to remove.
        </Body>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="meals planned" value={`${weekStats.planned}/21`} />
        <Stat label="avg kcal" value={avgKcal ? <><Mono>{avgKcal}</Mono></> : "—"} />
        <Stat label="week of" value={new Date(dateRange.from).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
      </div>

      {user ? <GenerateWeekButton /> : null}

      <PlanGrid days={days} entries={entries} />
    </div>
  );
}
