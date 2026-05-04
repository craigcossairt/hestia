"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
  Camera,
  Check,
} from "lucide-react";
import { Btn, H, Body, Label, Mono, Chip } from "@/components/ds";
import {
  matchIngredientsInStep,
  formatIngredientChip,
} from "@/lib/recipes/match-ingredients";
import { uploadRecipePhoto } from "@/app/(app)/recipes/actions";
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
  const router = useRouter();
  const [i, setI] = useState(0);
  const step = steps[i];
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  // Set when the user clicks Done on the last step. Triggers the
  // post-cook overlay where they can optionally upload a photo of the
  // finished plate to replace the recipe's photo.
  const [finished, setFinished] = useState(false);

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
          <Btn
            variant="primary"
            size="lg"
            onClick={() => setFinished(true)}
            full
          >
            Done
          </Btn>
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

      {finished ? (
        <FinishOverlay
          recipeId={recipeId}
          onClose={() => router.push(`/recipes/${recipeId}`)}
        />
      ) : null}
    </main>
  );
}

// Post-cook overlay. Asks the user if they want to capture a photo of
// the finished dish — if they do, it replaces the recipe's photo. Pure
// upgrade for AI-photo recipes that don't quite look right; the user
// gets a real photo of what they actually made into their library.
//
// On mobile the file input's `capture="environment"` attribute opens
// the rear camera directly. On desktop it falls back to the file
// picker.
function FinishOverlay({
  recipeId,
  onClose,
}: {
  recipeId: string;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function pickFile(file: File) {
    setError(null);
    setFilename(file.name);
    setContentType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreviewUrl(result);
      setBase64(result.split(",")[1] ?? "");
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsDataURL(file);
  }

  function save() {
    if (!base64 || !filename) return;
    setError(null);
    start(async () => {
      const r = await uploadRecipePhoto({
        recipeId,
        filename,
        base64,
        contentType: contentType ?? "image/jpeg",
      });
      if ("error" in r && r.error) {
        setError(r.error);
        return;
      }
      setSaved(true);
      // Brief beat so the user sees the "saved" state before the route
      // change snaps them back to the recipe.
      setTimeout(onClose, 600);
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-paper/95 backdrop-blur-sm flex items-center justify-center px-6 py-10">
      <div className="max-w-md w-full flex flex-col items-center gap-6 text-center">
        <Label>finished cooking</Label>
        <H size="lg">Nice work.</H>
        <Body size="sm" dim>
          Snap a quick photo of what you made — it&apos;ll replace the
          recipe&apos;s photo so your library shows the real thing.
          Skip if you&apos;re not feeling it.
        </Body>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = "";
          }}
        />

        {previewUrl ? (
          <div className="w-full flex flex-col gap-3">
            <div className="w-full aspect-square rounded-card overflow-hidden border border-ink-l bg-paper-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="finished dish"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex items-center gap-2">
              <Btn
                variant="primary"
                onClick={save}
                disabled={pending || saved}
                full
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  {saved ? (
                    <>
                      <Check size={16} /> Saved
                    </>
                  ) : (
                    <>{pending ? "Saving…" : "Use as recipe photo"}</>
                  )}
                </span>
              </Btn>
              <Btn
                variant="outline"
                onClick={() => {
                  setPreviewUrl(null);
                  setBase64(null);
                  setFilename(null);
                  setContentType(null);
                }}
                disabled={pending || saved}
              >
                Retake
              </Btn>
            </div>
          </div>
        ) : (
          <Btn
            variant="primary"
            size="lg"
            onClick={() => fileRef.current?.click()}
            full
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Camera size={18} /> Take a photo
            </span>
          </Btn>
        )}

        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="text-ink-3 hover:text-ink text-[13px] underline underline-offset-2 disabled:opacity-50"
        >
          Skip — close cook mode
        </button>

        {error ? (
          <Body size="xs" className="text-danger">
            {error}
          </Body>
        ) : null}
      </div>
    </div>
  );
}
