"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X, Play, Pause } from "lucide-react";
import { Btn, H, Body, Label, Mono } from "@/components/ds";
import type { Step } from "@/lib/types/database";

interface CookShellProps {
  recipeId: string;
  recipeName: string;
  steps: Step[];
}

export function CookShell({ recipeId, recipeName, steps }: CookShellProps) {
  const [i, setI] = useState(0);
  const step = steps[i];
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

      <section className="flex-1 flex flex-col items-center justify-center px-8 md:px-16 py-12 text-center max-w-3xl mx-auto w-full gap-10">
        <H size="md" className="text-ink-3">
          Step {i + 1}
        </H>
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
