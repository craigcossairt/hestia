"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X, Play, Pause, ChevronDown, ChevronUp } from "lucide-react";
import { Btn, H, Body, Label, Mono, Chip } from "@/components/ds";
import {
  matchIngredientsInStep,
  formatIngredientChip,
} from "@/lib/recipes/match-ingredients";
import type { Ingredient, Step } from "@/lib/types/database";

interface CookShellProps {
  recipeId: string;
  recipeName: string;
  steps: Step[];
  ingredients: Ingredient[];
}

export function CookShell({
  recipeId,
  recipeName,
  steps,
  ingredients,
}: CookShellProps) {
  const [i, setI] = useState(0);
  const step = steps[i];
  const [showAllIngredients, setShowAllIngredients] = useState(false);

  // Cache the per-step ingredient matches so flipping pages stays
  // instant — matching is O(steps × ingredients × text length) which
  // is cheap, but no reason to recompute on each render.
  const stepIngredients = useMemo(
    () => steps.map((s) => matchIngredientsInStep(s.text, ingredients)),
    [steps, ingredients],
  );
  const matchedForCurrent = step ? stepIngredients[i] : [];
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setRemaining(step?.timer_sec ?? null);
    setRunning(false);
  }, [i, step?.timer_sec]);

  useEffect(() => {
    if (!running || remaining == null) return;
    if (remaining <= 0) {
      setRunning(false);
      return;
    }
    const t = setInterval(() => setRemaining((r) => (r != null ? r - 1 : null)), 1000);
    return () => clearInterval(t);
  }, [running, remaining]);

  if (!step) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center">
        <H size="lg">No steps to cook.</H>
        <Link href={`/recipes/${recipeId}`}>
          <Btn variant="primary">Back to recipe</Btn>
        </Link>
      </main>
    );
  }

  const last = i === steps.length - 1;

  return (
    <main className="min-h-screen flex flex-col bg-paper">
      <header className="flex items-center justify-between px-6 py-4 border-b border-ink-l/50">
        <Link
          href={`/recipes/${recipeId}`}
          className="flex items-center gap-2 text-ink-3 hover:text-ink"
        >
          <X size={18} strokeWidth={1.5} />
          <span className="font-mono text-[11px] uppercase tracking-wider">Close</span>
        </Link>
        <div className="text-center">
          <Label>cook · {recipeName}</Label>
          <Mono className="text-ink text-[14px]">
            Step {i + 1} of {steps.length}
          </Mono>
        </div>
        <div className="w-12" />
      </header>

      <section className="flex-1 flex flex-col items-center justify-center px-8 md:px-16 py-12 text-center max-w-3xl mx-auto w-full gap-8">
        <H size="md" className="text-ink-3">
          Step {i + 1}
        </H>

        {matchedForCurrent.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
            {matchedForCurrent.map((ing, idx) => (
              <Chip key={`${ing.name}-${idx}`} variant="dim">
                {formatIngredientChip(ing)}
              </Chip>
            ))}
          </div>
        ) : null}

        <Body size="lg" className="text-ink text-[20px] md:text-[24px] leading-[1.45]">
          {step.text}
        </Body>

        {remaining != null ? (
          <div className="flex items-center gap-3">
            <Mono className="text-ink text-[40px] font-medium tabular-nums">
              {Math.floor(remaining / 60)
                .toString()
                .padStart(2, "0")}
              :
              {(remaining % 60).toString().padStart(2, "0")}
            </Mono>
            <button
              type="button"
              onClick={() => setRunning((r) => !r)}
              disabled={remaining <= 0}
              className="p-3 rounded-full bg-card border border-ink-l hover:border-ink-3 transition-colors disabled:opacity-50"
              aria-label={running ? "pause timer" : "start timer"}
            >
              {running ? <Pause size={18} /> : <Play size={18} />}
            </button>
          </div>
        ) : null}

        {ingredients.length > 0 ? (
          <div className="w-full max-w-2xl border border-ink-l/40 rounded-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAllIngredients((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-ink-3 hover:text-ink hover:bg-paper-2 transition-colors"
            >
              <span className="font-mono text-[10.5px] uppercase tracking-wider">
                All ingredients ({ingredients.length})
              </span>
              {showAllIngredients ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>
            {showAllIngredients ? (
              <ul className="flex flex-col text-left">
                {ingredients.map((ing, idx) => {
                  const usedHere = matchedForCurrent.includes(ing);
                  return (
                    <li
                      key={`all-${ing.name}-${idx}`}
                      className="flex items-baseline justify-between gap-3 px-4 py-2 border-t border-ink-l/30 first:border-t-0"
                    >
                      <Body
                        size="sm"
                        className={usedHere ? "text-accent" : "text-ink"}
                      >
                        {ing.name}
                      </Body>
                      <Mono className="text-ink-2 text-[12px] tabular-nums shrink-0">
                        {ing.qty} {ing.unit}
                      </Mono>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <footer className="flex items-center justify-between gap-4 px-6 py-6 border-t border-ink-l/50 max-w-3xl mx-auto w-full">
        <Btn
          variant="outline"
          onClick={() => setI(Math.max(0, i - 1))}
          disabled={i === 0}
        >
          <ChevronLeft size={16} /> Back
        </Btn>
        {last ? (
          <Link href={`/recipes/${recipeId}`}>
            <Btn variant="primary" size="lg" full>
              Done
            </Btn>
          </Link>
        ) : (
          <Btn
            variant="primary"
            size="lg"
            onClick={() => setI(Math.min(steps.length - 1, i + 1))}
            full
          >
            Next <ChevronRight size={16} />
          </Btn>
        )}
      </footer>
    </main>
  );
}
