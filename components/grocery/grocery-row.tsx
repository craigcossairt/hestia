"use client";

import { useEffect, useState, useTransition } from "react";
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
  // Optional Kroger enrichment: shown when the user has picked a home
  // store on /me and the product was findable in that store's catalog.
  // priceCents is the regular shelf price; salePriceCents the promo
  // price if currently active.
  priceCents?: number | null;
  salePriceCents?: number | null;
  aisleNumber?: string | null;
  productName?: string | null;
}

export function GroceryRow({
  itemKey,
  name,
  qty,
  unit,
  fromRecipes,
  initialChecked,
  priceCents,
  salePriceCents,
  aisleNumber,
  productName,
}: GroceryRowProps) {
  const [checked, setChecked] = useState(initialChecked);
  const [pending, start] = useTransition();
  // Sync local state when the parent re-renders with a new `initialChecked`.
  // Required for the bulk select-all / deselect-section actions to actually
  // update the row UI after the server-side revalidation: React preserves
  // useState across re-renders, so without this effect the checkboxes stay
  // visually unchanged even though the database is correct.
  useEffect(() => {
    setChecked(initialChecked);
  }, [initialChecked]);
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
      <div className="flex-1 min-w-0">
        <Body className={cn("text-ink", checked && "line-through")}>{name}</Body>
        <div className="text-ink-3 font-sans text-[11px] mt-0.5 flex items-center gap-2 flex-wrap">
          <span>
            for {fromRecipes.slice(0, 2).join(", ")}
            {fromRecipes.length > 2 ? ` +${fromRecipes.length - 2}` : ""}
          </span>
          {aisleNumber ? (
            <Mono className="text-accent text-[10px] uppercase">
              aisle {aisleNumber}
            </Mono>
          ) : null}
          {productName ? (
            <span className="truncate">· {productName}</span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <Mono className="text-ink-2 text-[12.5px]">
          {qty} {unit}
        </Mono>
        {priceCents != null || salePriceCents != null ? (
          <div className="flex items-baseline gap-1">
            {salePriceCents != null ? (
              <Mono className="text-accent text-[12px] font-semibold">
                ${(salePriceCents / 100).toFixed(2)}
              </Mono>
            ) : null}
            {priceCents != null ? (
              <Mono
                className={cn(
                  "text-[11px]",
                  salePriceCents != null
                    ? "text-ink-3 line-through"
                    : "text-ink-2",
                )}
              >
                ${(priceCents / 100).toFixed(2)}
              </Mono>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
