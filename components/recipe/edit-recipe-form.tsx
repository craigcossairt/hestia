"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload, Image as ImageIcon } from "lucide-react";
import { Card, Label, Body, Btn, Mono, Chip } from "@/components/ds";
import {
  updateRecipe,
  uploadRecipePhoto,
  deleteRecipe,
  recalculateRecipeMacros,
  type RecipePatch,
} from "@/app/(app)/recipes/actions";
import type { Ingredient, Step } from "@/lib/types/database";
import type { ParsedIngredient } from "@/lib/recipes/parse-ingredient-line";
import {
  parseIngredientLine,
  parseIngredientPaste,
} from "@/lib/recipes/parse-ingredient-line";
import { parseStepTimer } from "@/lib/recipes/parse-step-timer";
import {
  combineStepTimer,
  splitStepTimer,
} from "@/lib/recipes/step-timer-display";
import {
  normalizeIngredients,
  normalizeSteps,
  normalizeTips,
} from "@/lib/recipes/normalize-recipe-form";
import { cn } from "@/lib/utils";

const COMMON_TAGS = [
  "breakfast",
  "lunch",
  "dinner",
  "dessert",
  "snack",
  "beverage",
  "high-protein",
  "vegetarian",
  "vegan",
  "under-30min",
  "one-pan",
  "low-carb",
  "gluten-free",
];

const AISLE_OPTIONS = [
  "produce",
  "protein",
  "dairy",
  "pantry",
  "frozen",
  "spices",
  "bakery",
] as const;

interface InitialRecipe {
  name: string;
  photo_url: string | null;
  time_min: number;
  servings: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: Ingredient[];
  steps: Step[];
  tags: string[];
  tips: string[];
}

interface FormState extends InitialRecipe {
  prep_min: number;
  cook_min: number;
}

function buildInitialForm(initial: InitialRecipe): FormState {
  return {
    ...initial,
    tips: normalizeTips(initial.tips),
    ingredients: normalizeIngredients(initial.ingredients),
    steps: normalizeSteps(initial.steps),
    prep_min: 0,
    cook_min: initial.time_min,
  };
}

interface EditRecipeFormProps {
  recipeId: string;
  initial: InitialRecipe;
}

export function EditRecipeForm({ recipeId, initial }: EditRecipeFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => buildInitialForm(initial));
  const [pending, start] = useTransition();
  const [macroPending, startMacro] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const totalMin = form.prep_min + form.cook_min;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((cur) => ({ ...cur, [key]: value }));
  }

  function mergeParsedIngredient(
    ing: Ingredient,
    parsed: ParsedIngredient,
  ): Ingredient {
    return {
      ...ing,
      qty: parsed.qty,
      unit: parsed.unit,
      name: parsed.name,
      aisle: ing.aisle ?? parsed.aisle,
    };
  }

  function parseIngredientRow(index: number, raw: string) {
    const parsed = parseIngredientLine(raw);
    if (!parsed) return;
    setForm((cur) => ({
      ...cur,
      ingredients: cur.ingredients.map((x, j) =>
        j === index ? mergeParsedIngredient(x, parsed) : x,
      ),
    }));
  }

  function parseAllIngredients() {
    setForm((cur) => ({
      ...cur,
      ingredients: cur.ingredients.map((ing) => {
        const parsed = parseIngredientLine(ing.name);
        if (!parsed) return ing;
        return mergeParsedIngredient(ing, parsed);
      }),
    }));
  }

  function handleIngredientPaste(
    e: React.ClipboardEvent<HTMLInputElement>,
    index: number,
  ) {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\n")) return;
    e.preventDefault();
    const rows = parseIngredientPaste(text);
    if (rows.length === 0) return;
    setForm((cur) => {
      const next = [...cur.ingredients];
      next[index] = mergeParsedIngredient(next[index], rows[0]);
      for (let i = 1; i < rows.length; i++) {
        next.splice(index + i, 0, {
          name: rows[i].name,
          qty: rows[i].qty,
          unit: rows[i].unit,
          aisle: rows[i].aisle,
        });
      }
      return { ...cur, ingredients: next };
    });
  }

  function parseStepRow(index: number) {
    setForm((cur) => {
      const step = cur.steps[index];
      if (!step?.text.trim()) return cur;
      if (step.timer_sec != null && step.timer_sec > 0) return cur;
      const sec = parseStepTimer(step.text);
      if (sec == null) return cur;
      return {
        ...cur,
        steps: cur.steps.map((x, j) =>
          j === index ? { ...x, timer_sec: sec } : x,
        ),
      };
    });
  }

  function parseAllStepTimers() {
    setForm((cur) => ({
      ...cur,
      steps: cur.steps.map((step) => {
        if (step.timer_sec != null && step.timer_sec > 0) return step;
        const sec = parseStepTimer(step.text);
        if (sec == null) return step;
        return { ...step, timer_sec: sec };
      }),
    }));
  }

  function recalcMacros() {
    setStatus(null);
    startMacro(async () => {
      const r = await recalculateRecipeMacros(recipeId, {
        ingredients: form.ingredients,
        servings: form.servings,
      });
      if (r?.error) {
        setStatus(`Error: ${r.error}`);
        return;
      }
      if (!r?.ok) return;
      setForm((cur) => ({
        ...cur,
        kcal: r.kcal ?? cur.kcal,
        protein: r.protein ?? cur.protein,
        carbs: r.carbs ?? cur.carbs,
        fat: r.fat ?? cur.fat,
      }));
      const cov =
        r.coverage != null ? ` (${Math.round(r.coverage * 100)}% ingredients matched)` : "";
      setStatus(`Macros recalculated${cov}.`);
    });
  }

  function save() {
    setStatus(null);
    const payload: RecipePatch = {
      name: form.name,
      photo_url: form.photo_url,
      time_min: totalMin || form.time_min,
      servings: form.servings,
      kcal: form.kcal,
      protein: form.protein,
      carbs: form.carbs,
      fat: form.fat,
      ingredients: form.ingredients,
      steps: form.steps,
      tags: form.tags,
      tips: form.tips.filter((t) => t.trim()),
    };
    start(async () => {
      const r = await updateRecipe(recipeId, payload);
      setStatus(r?.error ? `Error: ${r.error}` : "Saved.");
    });
  }

  function doDelete() {
    start(async () => {
      await deleteRecipe(recipeId);
      // deleteRecipe redirects to /recipes on the server side; nothing
      // more to do client-side.
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PhotoEditor
        recipeId={recipeId}
        currentUrl={form.photo_url}
        onChange={(url) => patch("photo_url", url)}
      />

      <Card className="p-6 flex flex-col gap-4">
        <Label accent>basics</Label>
        <Field label="Name">
          <input
            value={form.name}
            onChange={(e) => patch("name", e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Prep (min)">
            <input
              type="number"
              min={0}
              max={480}
              value={form.prep_min}
              onChange={(e) =>
                patch("prep_min", Math.max(0, Number(e.target.value) || 0))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Cook / bake (min)">
            <input
              type="number"
              min={0}
              max={480}
              value={form.cook_min}
              onChange={(e) =>
                patch("cook_min", Math.max(0, Number(e.target.value) || 0))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Total (min)">
            <input
              type="number"
              readOnly
              value={totalMin}
              className={cn(inputClass, "bg-paper-2 text-ink-3 cursor-default")}
              aria-label="Total time in minutes"
            />
          </Field>
          <Field label="Servings">
            <input
              type="number"
              min={1}
              max={20}
              value={form.servings}
              onChange={(e) => patch("servings", Number(e.target.value) || 1)}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label accent>macros (per serving)</Label>
          <div className="flex items-center gap-2">
            <Body size="xs" dim className="hidden sm:inline">
              Edit only when AI / USDA estimates are wrong.
            </Body>
            <Btn
              variant="outline"
              size="sm"
              onClick={recalcMacros}
              disabled={macroPending || pending}
            >
              {macroPending ? "Calculating…" : "Recalculate macros"}
            </Btn>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Field label="kcal">
            <input
              type="number"
              min={0}
              value={form.kcal}
              onChange={(e) => patch("kcal", Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field label="protein">
            <input
              type="number"
              min={0}
              value={form.protein}
              onChange={(e) => patch("protein", Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field label="carbs">
            <input
              type="number"
              min={0}
              value={form.carbs}
              onChange={(e) => patch("carbs", Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field label="fat">
            <input
              type="number"
              min={0}
              value={form.fat}
              onChange={(e) => patch("fat", Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label accent>ingredients</Label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={parseAllIngredients}
              className="text-ink-3 hover:text-ink text-[12px]"
            >
              parse quantities
            </button>
            <button
              type="button"
              onClick={() =>
                patch("ingredients", [
                  ...form.ingredients,
                  { name: "", qty: 1, unit: "each" },
                ])
              }
              className="text-ink-3 hover:text-ink text-[12px] flex items-center gap-1"
            >
              <Plus size={12} /> add row
            </button>
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {form.ingredients.map((ing, i) => (
            <li key={i} className="grid grid-cols-[1fr_70px_90px_100px_28px] gap-2 items-center">
              <input
                value={ing.name}
                onChange={(e) =>
                  patch(
                    "ingredients",
                    form.ingredients.map((x, j) =>
                      j === i ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
                onBlur={(e) => parseIngredientRow(i, e.target.value)}
                onPaste={(e) => handleIngredientPaste(e, i)}
                placeholder="ingredient"
                className={inputClass}
              />
              <input
                type="number"
                step="0.25"
                min={0}
                value={ing.qty}
                onChange={(e) =>
                  patch(
                    "ingredients",
                    form.ingredients.map((x, j) =>
                      j === i ? { ...x, qty: Number(e.target.value) || 0 } : x,
                    ),
                  )
                }
                className={inputClass}
              />
              <input
                value={ing.unit}
                onChange={(e) =>
                  patch(
                    "ingredients",
                    form.ingredients.map((x, j) =>
                      j === i ? { ...x, unit: e.target.value } : x,
                    ),
                  )
                }
                placeholder="unit"
                className={inputClass}
              />
              <select
                value={ing.aisle ?? ""}
                onChange={(e) =>
                  patch(
                    "ingredients",
                    form.ingredients.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            aisle: (e.target.value || undefined) as
                              | Ingredient["aisle"]
                              | undefined,
                          }
                        : x,
                    ),
                  )
                }
                className={inputClass}
              >
                <option value="">—</option>
                {AISLE_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  patch(
                    "ingredients",
                    form.ingredients.filter((_, j) => j !== i),
                  )
                }
                className="text-ink-3 hover:text-danger p-1 rounded"
                aria-label="remove ingredient"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label accent>steps</Label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={parseAllStepTimers}
              className="text-ink-3 hover:text-ink text-[12px]"
            >
              parse timers
            </button>
            <button
              type="button"
              onClick={() => patch("steps", [...form.steps, { text: "" }])}
              className="text-ink-3 hover:text-ink text-[12px] flex items-center gap-1"
            >
              <Plus size={12} /> add step
            </button>
          </div>
        </div>
        <ol className="flex flex-col gap-2">
          {form.steps.map((step, i) => (
            <li key={i} className="flex gap-2 items-start">
              <Mono className="text-ink-3 text-[14px] mt-2 w-7 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </Mono>
              <textarea
                value={step.text}
                onChange={(e) =>
                  patch(
                    "steps",
                    form.steps.map((x, j) =>
                      j === i ? { ...x, text: e.target.value } : x,
                    ),
                  )
                }
                onBlur={() => parseStepRow(i)}
                rows={2}
                className={cn(inputClass, "flex-1 resize-y")}
              />
              <div className="flex gap-1 mt-1 shrink-0">
                {(() => {
                  const { hours, minutes } = splitStepTimer(step.timer_sec);
                  return (
                    <>
                      <input
                        type="number"
                        min={0}
                        placeholder="h"
                        aria-label="timer hours"
                        value={hours > 0 ? hours : ""}
                        onChange={(e) => {
                          const h =
                            e.target.value === "" ? 0 : Number(e.target.value);
                          patch(
                            "steps",
                            form.steps.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    timer_sec: combineStepTimer(
                                      h,
                                      splitStepTimer(x.timer_sec).minutes,
                                    ),
                                  }
                                : x,
                            ),
                          );
                        }}
                        className={cn(inputClass, "w-12")}
                      />
                      <input
                        type="number"
                        min={0}
                        max={59}
                        placeholder="m"
                        aria-label="timer minutes"
                        value={minutes > 0 ? minutes : ""}
                        onChange={(e) => {
                          const m =
                            e.target.value === "" ? 0 : Number(e.target.value);
                          patch(
                            "steps",
                            form.steps.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    timer_sec: combineStepTimer(
                                      splitStepTimer(x.timer_sec).hours,
                                      m,
                                    ),
                                  }
                                : x,
                            ),
                          );
                        }}
                        className={cn(inputClass, "w-12")}
                      />
                    </>
                  );
                })()}
              </div>
              <button
                type="button"
                onClick={() =>
                  patch("steps", form.steps.filter((_, j) => j !== i))
                }
                className="text-ink-3 hover:text-danger p-1 rounded mt-2"
                aria-label="remove step"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="p-6 flex flex-col gap-3">
        <Label accent>tags</Label>
        <div className="flex flex-wrap gap-2">
          {COMMON_TAGS.map((t) => (
            <Chip
              key={t}
              variant={form.tags.includes(t) ? "fill" : "default"}
              interactive
              onClick={() =>
                patch(
                  "tags",
                  form.tags.includes(t)
                    ? form.tags.filter((x) => x !== t)
                    : [...form.tags, t],
                )
              }
            >
              {t}
            </Chip>
          ))}
        </div>
      </Card>

      <Card className="p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label accent>tips</Label>
          <button
            type="button"
            onClick={() => patch("tips", [...form.tips, ""])}
            className="text-ink-3 hover:text-ink text-[12px] flex items-center gap-1"
          >
            <Plus size={12} /> add tip
          </button>
        </div>
        <ol className="flex flex-col gap-2">
          {form.tips.map((tip, i) => (
            <li key={i} className="flex gap-2 items-start">
              <Mono className="text-ink-3 text-[14px] mt-2 w-7 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </Mono>
              <textarea
                value={tip}
                onChange={(e) =>
                  patch(
                    "tips",
                    form.tips.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
                rows={2}
                placeholder="Tip for best results…"
                className={cn(inputClass, "flex-1 resize-y")}
              />
              <button
                type="button"
                onClick={() =>
                  patch(
                    "tips",
                    form.tips.filter((_, j) => j !== i),
                  )
                }
                className="text-ink-3 hover:text-danger p-1 rounded mt-2"
                aria-label="remove tip"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ol>
        {form.tips.length === 0 ? (
          <Body size="xs" dim>
            No tips yet — add one above.
          </Body>
        ) : null}
      </Card>

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 bg-paper/90 backdrop-blur p-3 rounded-card border border-ink-l/40">
        <div className="flex items-center gap-3">
          <Btn variant="primary" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Btn>
          <Btn
            variant="ghost"
            onClick={() => router.push(`/recipes/${recipeId}`)}
          >
            Done
          </Btn>
        </div>
        {status ? (
          <Body
            size="xs"
            className={status.startsWith("Error") ? "text-danger" : "text-success"}
          >
            {status}
          </Body>
        ) : null}
      </div>

      <Card className="p-5 border-danger/30 flex flex-col gap-3">
        <Label className="text-danger">danger zone</Label>
        <Body size="sm" dim>
          Deleting a recipe is permanent. Saved-recipe bookmarks and
          ratings are removed too. Plan entries that reference this
          recipe will keep their slot but lose the meal.
        </Body>
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <Btn
              variant="primary"
              onClick={doDelete}
              disabled={pending}
              className="!bg-danger !border-danger"
            >
              Yes, delete forever
            </Btn>
            <Btn variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Btn>
          </div>
        ) : (
          <Btn
            variant="outline"
            onClick={() => setConfirmingDelete(true)}
            className="self-start"
          >
            Delete recipe
          </Btn>
        )}
      </Card>
    </div>
  );
}

const inputClass =
  "w-full px-2 py-1.5 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[13px] outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}

// ────────────────────────────────────────────────────────────────────
// Photo: file upload (Supabase Storage) OR URL paste OR keep current.
// Persists immediately on upload so the form state and the DB stay in
// sync — the rest of the form's "Save changes" button doesn't gate the
// photo specifically.
// ────────────────────────────────────────────────────────────────────
function PhotoEditor({
  recipeId,
  currentUrl,
  onChange,
}: {
  recipeId: string;
  currentUrl: string | null;
  onChange: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, start] = useTransition();
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:image/jpeg;base64,XXXX". Strip the prefix.
      const base64 = result.split(",")[1] ?? "";
      start(async () => {
        const r = await uploadRecipePhoto({
          recipeId,
          filename: file.name,
          base64,
          contentType: file.type,
        });
        if ("error" in r && r.error) {
          setError(r.error);
          return;
        }
        if ("url" in r && r.url) onChange(r.url);
      });
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsDataURL(file);
  }

  function applyUrl() {
    setError(null);
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed); // validate
    } catch {
      setError("That doesn't look like a URL.");
      return;
    }
    onChange(trimmed);
    setUrlInput("");
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label accent>photo</Label>
        {error ? (
          <Body size="xs" className="text-danger">
            {error}
          </Body>
        ) : null}
      </div>
      <div className="flex gap-4 items-start">
        <div className="w-32 h-32 shrink-0 rounded-card overflow-hidden border border-ink-l bg-paper-2 flex items-center justify-center">
          {currentUrl ? (
            // Plain <img> rather than next/image so non-allowlisted hosts
            // (Pexels, Brave thumbnails, user uploads) just work.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentUrl}
              alt="recipe photo"
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon size={28} className="text-ink-3" />
          )}
        </div>
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="flex flex-col gap-1">
            <Body size="xs" dim>
              Upload a new photo
            </Body>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = ""; // allow re-upload of same file
              }}
            />
            <Btn
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <span className="inline-flex items-center gap-1.5">
                <Upload size={14} />
                {uploading ? "Uploading…" : "Choose file"}
              </span>
            </Btn>
          </div>
          <div className="flex flex-col gap-1">
            <Body size="xs" dim>
              …or paste an image URL
            </Body>
            <div className="flex gap-2">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://…"
                className={inputClass}
              />
              <Btn variant="ghost" size="sm" onClick={applyUrl}>
                Use
              </Btn>
            </div>
          </div>
          {currentUrl ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="self-start text-ink-3 hover:text-danger text-[12px]"
            >
              Remove photo
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
