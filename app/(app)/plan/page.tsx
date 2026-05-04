import { H, Body, Label, Mono, Stat } from "@/components/ds";
import { createClient } from "@/lib/supabase/server";
import { PlanGrid, type PlanCellEntry } from "@/components/plan/plan-grid";
import { GenerateWeekButton } from "@/components/plan/generate-week-button";
import { RefinePlanForm } from "@/components/plan/refine-plan-form";
import { WeekNavigator } from "@/components/plan/week-navigator";
import { inferSlotDefaults } from "@/lib/programs";
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
  searchParams: Promise<{ week?: string; refine?: string }>;
}) {
  const sp = await searchParams;
  const initialRefineText = sp?.refine?.trim() || undefined;
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
  let userActivePrograms: string[] = [];
  // entry id → "Mon dinner — Sheet pan chicken" (for the Refine diff preview).
  const entryLabels: Record<string, string> = {};

  if (user) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("active_programs")
      .eq("id", user.id)
      .maybeSingle();
    userActivePrograms =
      ((profileRow as { active_programs?: string[] | null } | null)
        ?.active_programs) ?? [];

    const { data } = await supabase
      .from("meal_plan_entries")
      .select(
        "id, date, slot, recipe_id, is_leftover_of, recipes:recipe_id(name, kcal, photo_url)",
      )
      .eq("user_id", user.id)
      .gte("date", dateRange.from)
      .lte("date", dateRange.to);

    type Row = {
      id: string;
      date: string;
      slot: Slot;
      recipe_id: string | null;
      is_leftover_of: string | null;
      recipes: { name: string; kcal: number | null; photo_url: string | null } | null;
    };
    const rows = (data ?? []) as unknown as Row[];

    // Build a map of entry_id → "Mon dinner" for the leftover badge.
    const labelByEntryId = new Map<string, string>();
    for (const row of rows) {
      const dateLabel = new Date(`${row.date}T00:00:00`).toLocaleDateString(
        "en-US",
        { weekday: "short" },
      );
      labelByEntryId.set(row.id, `${dateLabel.toLowerCase()} ${row.slot}`);
    }

    for (const row of rows) {
      const cell: PlanCellEntry | undefined =
        row.recipes && row.recipe_id
          ? {
              id: row.id,
              recipeId: row.recipe_id,
              recipeName: row.recipes.name,
              kcal: row.recipes.kcal,
              photoUrl: row.recipes.photo_url,
              leftoverOfLabel: row.is_leftover_of
                ? (labelByEntryId.get(row.is_leftover_of) ?? null)
                : null,
            }
          : undefined;
      if (!entries[row.date])
        entries[row.date] = {} as Record<Slot, PlanCellEntry | undefined>;
      entries[row.date][row.slot] = cell;
      slotsWithEntries.add(row.slot);
      // Only count kcal for the original cook session, not leftovers, so the
      // weekly average isn't double-counted.
      if (row.recipes?.kcal && !row.is_leftover_of)
        weekStats.kcal += row.recipes.kcal;
      if (cell) weekStats.planned += 1;
      const dateLabel = new Date(`${row.date}T00:00:00`).toLocaleDateString(
        "en-US",
        { weekday: "short" },
      );
      entryLabels[row.id] = `${dateLabel.toLowerCase()} ${row.slot} — ${row.recipes?.name ?? "?"}`;
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

      {user ? (
        <GenerateWeekButton
          weekStart={weekStartStr}
          inferredDefaults={inferSlotDefaults(userActivePrograms)}
        />
      ) : null}

      {user ? (
        <RefinePlanForm
          weekStart={weekStartStr}
          entryLabels={entryLabels}
          hasEntries={weekStats.planned > 0}
          initialRefineText={initialRefineText}
        />
      ) : null}

      <PlanGrid days={days} entries={entries} slots={slots} />
    </div>
  );
}
