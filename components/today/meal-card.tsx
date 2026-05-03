"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Card, FoodImage, Label, H, Mono, Chip, Btn } from "@/components/ds";
import {
  logPlannedMeal,
  skipPlannedMeal,
} from "@/app/(app)/today/log-actions";
import { LogMealModal } from "./log-meal-modal";
import type { Slot } from "@/lib/types/database";

interface PlannedMealCardProps {
  planEntryId: string;
  slot: string;
  time?: string;
  name: string;
  kcal?: number | null;
  protein?: number | null;
  status: "planned" | "logged" | "skipped";
  recipeId: string;
  photoUrl?: string | null;
}

export function PlannedMealCard({
  planEntryId,
  slot,
  time,
  name,
  kcal,
  protein,
  status,
  recipeId,
  photoUrl,
}: PlannedMealCardProps) {
  const [pending, start] = useTransition();
  return (
    <Card className="overflow-hidden flex flex-col">
      <Link href={`/recipes/${recipeId}`}>
        <FoodImage
          name={name}
          src={photoUrl ?? undefined}
          height={140}
          rounded={false}
          showLabel={false}
        />
      </Link>
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>
            {slot}
            {time ? ` · ${time}` : ""}
          </Label>
          <Chip
            variant={
              status === "logged"
                ? "success"
                : status === "skipped"
                  ? "dim"
                  : "default"
            }
            className="capitalize"
          >
            {status}
          </Chip>
        </div>
        <Link href={`/recipes/${recipeId}`}>
          <H size="sm">{name}</H>
        </Link>
        {kcal != null || protein != null ? (
          <Mono className="text-ink-2 text-[12.5px]">
            {kcal != null ? `${kcal} kcal` : null}
            {kcal != null && protein != null ? " · " : null}
            {protein != null ? `${protein} g protein` : null}
          </Mono>
        ) : null}
        {status === "planned" ? (
          <div className="flex gap-2 pt-1">
            <Btn
              variant="primary"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await logPlannedMeal(planEntryId);
                })
              }
            >
              <Check size={14} strokeWidth={2} /> Mark eaten
            </Btn>
            <Btn
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await skipPlannedMeal(planEntryId);
                })
              }
            >
              Skip
            </Btn>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function EmptyMealCard({
  slot,
  time,
}: {
  slot: string;
  time?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card className="p-4 flex flex-col gap-2 border-dashed bg-paper-2/40 min-h-[180px] justify-between">
        <div>
          <Label>
            {slot}
            {time ? ` · ${time}` : ""}
          </Label>
          <div className="text-ink-3 font-display text-[18px] italic mt-2">
            Nothing planned
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Btn variant="outline" size="sm" onClick={() => setOpen(true)}>
            Log a meal
          </Btn>
        </div>
      </Card>
      <LogMealModal
        open={open}
        onClose={() => setOpen(false)}
        defaultSlot={slot as Slot}
      />
    </>
  );
}

// Floating "log anything" entry point — for today's standing macro bar.
export function LogAnythingButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn variant="outline" onClick={() => setOpen(true)}>
        + Log a meal
      </Btn>
      <LogMealModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
