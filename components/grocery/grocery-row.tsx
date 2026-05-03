"use client";

import { useState, useTransition } from "react";
import { Body, Mono, Check } from "@/components/ds";
import { toggleGroceryItem } from "@/app/(app)/shop/actions";
import { cn } from "@/lib/utils";

interface GroceryRowProps {
  itemKey: string;
  name: string;
  qty: number;
  unit: string;
  fromRecipes: string[];
  initialChecked: boolean;
}

export function GroceryRow({
  itemKey,
  name,
  qty,
  unit,
  fromRecipes,
  initialChecked,
}: GroceryRowProps) {
  const [checked, setChecked] = useState(initialChecked);
  const [pending, start] = useTransition();
  return (
    <li
      className={cn(
        "flex items-center gap-3 py-2.5 border-b border-ink-l/40 last:border-b-0 transition-opacity",
        checked && "opacity-50",
      )}
    >
      <Check
        checked={checked}
        disabled={pending}
        onChange={(next) => {
          setChecked(next);
          start(async () => {
            await toggleGroceryItem(itemKey, next);
          });
        }}
        size={20}
      />
      <div className="flex-1">
        <Body className={cn("text-ink", checked && "line-through")}>{name}</Body>
        <div className="text-ink-3 font-sans text-[11px] mt-0.5">
          for {fromRecipes.slice(0, 2).join(", ")}
          {fromRecipes.length > 2 ? ` +${fromRecipes.length - 2}` : ""}
        </div>
      </div>
      <Mono className="text-ink-2 text-[12.5px]">
        {qty} {unit}
      </Mono>
    </li>
  );
}
