import { H, Body, Label, Mono, Stat } from "@/components/ds";
import { createClient } from "@/lib/supabase/server";
import { PlanGrid, type PlanCellEntry } from "@/components/plan/plan-grid";
import { GenerateWeekButton } from "@/components/plan/generate-week-button";
import { WeekNavigator } from "@/components/plan/week-navigator";
import type { Slot } from "@/lib/types/database";

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });

// Slots always rendered as rows on the plan grid.
const BASE_SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];
// Optional slots — rendered only when at least one entry exists for them
// in the current week.
const OPTIONAL_SLOTS: Slot[] = ["snack", "dessert", "beverage"];

function startOfWeek(d: Date): Date {
  // Monday-anchored
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function snapToMonday(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00`);
  return startOfWeek(d);
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

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const start =
    sp?.week && isValidDate(sp.week)
      ? snapToMonday(sp.week)
      : startOfWeek(new Date());
  const days = nextDays(start, 7);
  const dateRange = { from: days[0].date, to: days[6].date };
  const weekStartStr = days[0].date;
  const thisWeekStr = startOfWeek(new Date()).toISOString().slice(0, 10);
  const isCurrentWeek = weekStartStr === thisWeekStr;

  const entries: Record<string, Record<Slot, PlanCellEntry | undefined>> = {};
  const weekStats = { kcal: 0, planned: 0 };
  const slotsWithEntries = new Set<Slot>();

  if (user) {
    const { data } = await supabase
      .from("meal_plan_entries")
      .select(
        "id, date, slot, recipe_id, recipes:recipe_id(name, kcal, photo_url)",
      )
      .eq("user_id", user.id)
      .gte("date", dateRange.from)
      .lte("date", dateRange.to);

    type Row = {
      id: string;
      date: string;
      slot: Slot;
      recipe_id: string | null;
      recipes: { name: string; kcal: number | null; photo_url: string | null } | null;
    };
    const rows = (data ?? []) as unknown as Row[];

    for (const row of rows) {
      const cell: PlanCellEntry | undefined =
        row.recipes && row.recipe_id
          ? {
              id: row.id,
              recipeId: row.recipe_id,
              recipeName: row.recipes.name,
              kcal: row.recipes.kcal,
              photoUrl: row.recipes.photo_url,
            }
          : undefined;
      if (!entries[row.date])
        entries[row.date] = {} as Record<Slot, PlanCellEntry | undefined>;
      entries[row.date][row.slot] = cell;
      slotsWithEntries.add(row.slot);
      if (row.recipes?.kcal) weekStats.kcal += row.recipes.kcal;
      if (cell) weekStats.planned += 1;
    }
  }

  // Render base slots always; show optional slots only when populated.
  const slots: Slot[] = [
    ...BASE_SLOTS,
    ...OPTIONAL_SLOTS.filter((s) => slotsWithEntries.has(s)),
  ];
  const totalSlots = slots.length * 7;
  const avgKcal = weekStats.planned ? Math.round(weekStats.kcal / 7) : 0;

  return (
    <div className="px-6 md:px-12 py-8 md:py-12 max-w-6xl mx-auto flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Label>plan</Label>
          <WeekNavigator weekStart={weekStartStr} />
        </div>
        <H size="xl" as="h1">
          {isCurrentWeek ? "Plan" : "Week ahead"}
        </H>
        <Body size="lg" dim>
          Click a meal to open its recipe. Hover a card to remove or swap.
        </Body>
      </header>

      <div className="grid grid-cols-2 gap-4">
        <Stat label="meals planned" value={`${weekStats.planned}/${totalSlots}`} />
        <Stat label="avg kcal" value={avgKcal ? <Mono>{avgKcal}</Mono> : "—"} />
      </div>

      {user ? <GenerateWeekButton weekStart={weekStartStr} /> : null}

      <PlanGrid days={days} entries={entries} slots={slots} />
    </div>
  );
}
