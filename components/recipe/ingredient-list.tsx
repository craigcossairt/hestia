"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Body, Mono, Chip, Check } from "@/components/ds";
import { SubstitutionDrawer } from "./substitution-drawer";
import type { Ingredient } from "@/lib/types/database";

interface IngredientListProps {
  ingredients: Ingredient[];
  recipeName: string;
  pantryNames: Set<string>;
}

export function IngredientList({
  ingredients,
  recipeName,
  pantryNames,
}: IngredientListProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [subTarget, setSubTarget] = useState<string | null>(null);

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <>
      <ul className="flex flex-col">
        {ingredients.map((ing, i) => {
          const inPantry = pantryNames.has(ing.name.toLowerCase());
          const isChecked = checked.has(i);
          return (
            <li
              key={i}
              className="flex items-center gap-3 py-3 border-b border-ink-l/50 last:border-b-0"
            >
              <Check checked={isChecked} onChange={() => toggle(i)} />
              <div className="flex-1 flex items-baseline gap-2 flex-wrap">
                <Mono className="text-ink-3 text-[12.5px]">
                  {ing.qty} {ing.unit}
                </Mono>
                <Body
                  className={isChecked ? "line-through text-ink-3" : "text-ink"}
                >
                  {ing.name}
                </Body>
                {inPantry ? (
                  <Chip variant="success">In stock</Chip>
                ) : (
                  <Chip variant="dim">Need</Chip>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSubTarget(ing.name)}
                className="text-ink-3 hover:text-ink p-1.5 rounded-thumb hover:bg-paper-2 transition-colors"
                aria-label={`substitute ${ing.name}`}
              >
                <ArrowLeftRight size={14} strokeWidth={1.5} />
              </button>
            </li>
          );
        })}
      </ul>
      {subTarget ? (
        <SubstitutionDrawer
          open
          onClose={() => setSubTarget(null)}
          ingredient={subTarget}
          recipeName={recipeName}
        />
      ) : null}
    </>
  );
}
