"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Card, Label, Mono, FoodImage } from "@/components/ds";
import { RecipePicker } from "./recipe-picker";
import { clearPlanSlot } from "@/app/(app)/plan/actions";
import type { Slot } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];

export interface PlanCellEntry {
  id: string;
  recipeName: string;
  kcal: number | null;
  photoUrl: string | null;
}

export interface PlanGridProps {
  days: Array<{ date: string; weekday: string; dayNum: string }>;
  entries: Record<string, Record<Slot, PlanCellEntry | undefined>>;
}

export function PlanGrid({ days, entries }: PlanGridProps) {
  const [picker, setPicker] = useState<{ date: string; slot: Slot } | null>(null);

  return (
    <>
      {/* Desktop grid: 7 cols × 3 rows */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-3 mb-3">
          {days.map((d) => (
            <div key={d.date} className="text-center">
              <Label>{d.weekday}</Label>
              <Mono className="text-ink text-[20px] font-medium">{d.dayNum}</Mono>
            </div>
          ))}
        </div>
        {SLOTS.map((slot) => (
          <div key={slot} className="grid grid-cols-7 gap-3 mb-3">
            {days.map((d) => (
              <PlanCell
                key={`${d.date}-${slot}`}
                slot={slot}
                date={d.date}
                entry={entries[d.date]?.[slot]}
                onAssign={() => setPicker({ date: d.date, slot })}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Mobile: vertical stack per day, with day strip on top */}
      <div className="md:hidden flex flex-col gap-6">
        {days.map((d) => (
          <div key={d.date} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <Label>{d.weekday}</Label>
              <Mono className="text-ink text-[16px] font-medium">{d.dayNum}</Mono>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {SLOTS.map((slot) => (
                <PlanCell
                  key={`${d.date}-${slot}`}
                  slot={slot}
                  date={d.date}
                  entry={entries[d.date]?.[slot]}
                  onAssign={() => setPicker({ date: d.date, slot })}
                  showSlotLabel
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {picker ? (
        <RecipePicker
          open
          onClose={() => setPicker(null)}
          date={picker.date}
          slot={picker.slot}
        />
      ) : null}
    </>
  );
}

function PlanCell({
  slot,
  entry,
  onAssign,
  showSlotLabel,
}: {
  slot: Slot;
  date: string;
  entry: PlanCellEntry | undefined;
  onAssign: () => void;
  showSlotLabel?: boolean;
}) {
  const [pending, start] = useTransition();

  if (!entry) {
    return (
      <button
        type="button"
        onClick={onAssign}
        className={cn(
          "rounded-card border border-dashed border-ink-l p-3 flex flex-col items-center justify-center text-ink-3 hover:text-ink hover:border-ink-3 transition-colors min-h-[100px] gap-1",
        )}
      >
        <Plus size={16} strokeWidth={1.5} />
        <span className="font-mono text-[10px] uppercase tracking-wider">
          {showSlotLabel ? slot : "add"}
        </span>
      </button>
    );
  }

  return (
    <Card className="overflow-hidden flex flex-col group relative min-h-[100px]">
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          start(async () => {
            await clearPlanSlot(entry.id);
          });
        }}
        className="absolute top-1.5 right-1.5 z-10 p-1 rounded-full bg-card/80 text-ink-3 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="remove"
      >
        <X size={12} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={onAssign}
        className="flex-1 flex flex-col text-left"
      >
        <FoodImage
          name={entry.recipeName}
          src={entry.photoUrl ?? undefined}
          height={70}
          rounded={false}
          showLabel={false}
        />
        <div className="px-2 py-1.5 flex flex-col gap-0.5">
          {showSlotLabel ? <Label>{slot}</Label> : null}
          <div className="text-ink font-sans text-[12px] line-clamp-2 leading-tight">
            {entry.recipeName}
          </div>
          {entry.kcal != null ? (
            <Mono className="text-ink-3 text-[10px]">{entry.kcal} kcal</Mono>
          ) : null}
        </div>
      </button>
    </Card>
  );
}
