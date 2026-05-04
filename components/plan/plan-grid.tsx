"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus, X, GripVertical, Pencil } from "lucide-react";
import { Card, Label, Mono, FoodImage } from "@/components/ds";
import { RecipePicker } from "./recipe-picker";
import { clearPlanSlot, movePlanEntry } from "@/app/(app)/plan/actions";
import type { Slot } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const DEFAULT_SLOTS: Slot[] = ["breakfast", "lunch", "dinner"];

export interface PlanCellEntry {
  id: string;
  recipeId: string;
  recipeName: string;
  kcal: number | null;
  photoUrl: string | null;
  // When set, this slot is leftovers from another cook session — render
  // a small "leftover from {label}" pill on the card.
  leftoverOfLabel?: string | null;
}

export interface PlanGridProps {
  days: Array<{ date: string; weekday: string; dayNum: string }>;
  entries: Record<string, Record<Slot, PlanCellEntry | undefined>>;
  slots?: Slot[];
}

export function PlanGrid({ days, entries, slots = DEFAULT_SLOTS }: PlanGridProps) {
  const [picker, setPicker] = useState<{ date: string; slot: Slot } | null>(null);
  const [draggingEntry, setDraggingEntry] = useState<PlanCellEntry | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    setDraggingEntry(null);
    if (!e.over) return;
    const fromEntryId = String(e.active.id);
    const overId = String(e.over.id);
    const [toDate, toSlot] = overId.split("|") as [string, Slot];
    if (!toDate || !toSlot) return;
    start(async () => {
      await movePlanEntry({ fromEntryId, toDate, toSlot });
    });
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => {
        const id = String(e.active.id);
        for (const date of Object.keys(entries)) {
          for (const slot of slots) {
            const entry = entries[date]?.[slot];
            if (entry?.id === id) {
              setDraggingEntry(entry);
              return;
            }
          }
        }
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingEntry(null)}
    >
      {/* Desktop grid: 7 cols × N rows (N = base slots + any optional slots in use) */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-3 mb-3">
          {days.map((d) => (
            <div key={d.date} className="text-center">
              <Label>{d.weekday}</Label>
              <Mono className="text-ink text-[20px] font-medium">{d.dayNum}</Mono>
            </div>
          ))}
        </div>
        {slots.map((slot) => (
          <div key={slot} className="grid grid-cols-7 gap-3 mb-3">
            {days.map((d) => (
              <DroppableCell
                key={`${d.date}-${slot}`}
                date={d.date}
                slot={slot}
                entry={entries[d.date]?.[slot]}
                onAssign={() => setPicker({ date: d.date, slot })}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Mobile: per-day stack */}
      <div className="md:hidden flex flex-col gap-6">
        {days.map((d) => (
          <div key={d.date} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <Label>{d.weekday}</Label>
              <Mono className="text-ink text-[16px] font-medium">{d.dayNum}</Mono>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {slots.map((slot) => (
                <DroppableCell
                  key={`${d.date}-${slot}`}
                  date={d.date}
                  slot={slot}
                  entry={entries[d.date]?.[slot]}
                  onAssign={() => setPicker({ date: d.date, slot })}
                  showSlotLabel
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <DragOverlay>
        {draggingEntry ? (
          <Card className="overflow-hidden flex flex-col w-[140px] opacity-90">
            <FoodImage
              name={draggingEntry.recipeName}
              src={draggingEntry.photoUrl ?? undefined}
              height={70}
              rounded={false}
              showLabel={false}
            />
            <div className="px-2 py-1.5">
              <div className="text-ink font-sans text-[12px] line-clamp-2 leading-tight">
                {draggingEntry.recipeName}
              </div>
            </div>
          </Card>
        ) : null}
      </DragOverlay>

      {picker ? (
        <RecipePicker
          open
          onClose={() => setPicker(null)}
          date={picker.date}
          slot={picker.slot}
        />
      ) : null}
    </DndContext>
  );
}

function DroppableCell({
  date,
  slot,
  entry,
  onAssign,
  showSlotLabel,
}: {
  date: string;
  slot: Slot;
  entry: PlanCellEntry | undefined;
  onAssign: () => void;
  showSlotLabel?: boolean;
}) {
  const dropId = `${date}|${slot}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-card transition-shadow",
        isOver && "ring-2 ring-accent",
      )}
    >
      {entry ? (
        <FilledCell
          entry={entry}
          slot={slot}
          onSwap={onAssign}
          showSlotLabel={showSlotLabel}
        />
      ) : (
        <button
          type="button"
          onClick={onAssign}
          className="w-full rounded-card border border-dashed border-ink-l p-3 flex flex-col items-center justify-center text-ink-3 hover:text-ink hover:border-ink-3 transition-colors min-h-[100px] gap-1"
        >
          <Plus size={16} strokeWidth={1.5} />
          <span className="font-mono text-[10px] uppercase tracking-wider">
            {showSlotLabel ? slot : "add"}
          </span>
        </button>
      )}
    </div>
  );
}

function FilledCell({
  entry,
  slot,
  onSwap,
  showSlotLabel,
}: {
  entry: PlanCellEntry;
  slot: Slot;
  onSwap: () => void;
  showSlotLabel?: boolean;
}) {
  const [pending, start] = useTransition();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.id,
  });

  return (
    <Card
      className={cn(
        "overflow-hidden flex flex-col group relative min-h-[100px]",
        isDragging && "opacity-30",
      )}
    >
      {/* Drag handle */}
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="absolute top-1.5 left-1.5 z-10 p-1 rounded-full bg-card/80 text-ink-3 hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        aria-label="drag to reschedule"
      >
        <GripVertical size={12} strokeWidth={1.5} />
      </div>
      {/* Swap (re-assign recipe) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSwap();
        }}
        className="absolute top-1.5 right-7 z-10 p-1 rounded-full bg-card/80 text-ink-3 hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="swap recipe"
        title="Swap recipe"
      >
        <Pencil size={11} strokeWidth={1.5} />
      </button>
      {/* Remove */}
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

      {/* Card body — clicking opens the recipe page. */}
      <Link
        href={`/recipes/${entry.recipeId}`}
        className="flex-1 flex flex-col text-left hover:opacity-90 transition-opacity"
      >
        <div className="relative">
          <FoodImage
            name={entry.recipeName}
            src={entry.photoUrl ?? undefined}
            height={70}
            rounded={false}
            showLabel={false}
          />
          {entry.leftoverOfLabel ? (
            <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-ink/70 text-paper font-mono text-[9px] uppercase tracking-wider">
              leftover
            </span>
          ) : null}
        </div>
        <div className="px-2 py-1.5 flex flex-col gap-0.5">
          {showSlotLabel ? <Label>{slot}</Label> : null}
          <div className="text-ink font-sans text-[12px] line-clamp-2 leading-tight">
            {entry.recipeName}
          </div>
          {entry.leftoverOfLabel ? (
            <Mono className="text-ink-3 text-[10px]">
              from {entry.leftoverOfLabel}
            </Mono>
          ) : entry.kcal != null ? (
            <Mono className="text-ink-3 text-[10px]">{entry.kcal} kcal</Mono>
          ) : null}
        </div>
      </Link>
    </Card>
  );
}
