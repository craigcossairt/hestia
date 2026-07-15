"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, H, Body, Btn, Label, Mono, Chip } from "@/components/ds";
import { saveGeneratedRecipe } from "@/app/(app)/recipes/actions";
import { StepPhotoControl } from "@/components/recipe/step-photo-control";
import { parseIngredientPaste } from "@/lib/recipes/parse-ingredient-line";
import { formatQuantity } from "@/lib/recipes/quantity";
import { parseStepTimer } from "@/lib/recipes/parse-step-timer";
import { cn } from "@/lib/utils";
import type { GeneratedRecipe } from "@/lib/ai/prompts/recipe";
import type { Step } from "@/lib/types/database";

type Mode = "ai" | "url" | "photo" | "manual";

const MODE_LABELS: Record<Mode, string> = {
  ai: "Ask Hestia",
  url: "Paste URL",
  photo: "Photo",
  manual: "Write it",
};

interface AddRecipeModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddRecipeModal({ open, onClose }: AddRecipeModalProps) {
  const [mode, setMode] = useState<Mode>("ai");
  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <div className="p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Label>add a recipe</Label>
          <button onClick={onClose} className="text-ink-3 hover:text-ink text-[13px]">
            Close
          </button>
        </div>
        <H size="md" as="h2">
          Where should the recipe come from?
        </H>

        <div className="grid grid-cols-4 gap-1 p-1 bg-paper-2 rounded-thumb">
          {(["ai", "url", "photo", "manual"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-2 rounded-thumb font-sans text-[12.5px] transition-colors",
                mode === m ? "bg-card text-ink shadow-[var(--shadow-1)]" : "text-ink-3",
              )}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {mode === "ai" && <AiMode onClose={onClose} />}
        {mode === "url" && <UrlMode onClose={onClose} />}
        {mode === "photo" && <PhotoMode onClose={onClose} />}
        {mode === "manual" && <ManualMode onClose={onClose} />}
      </div>
    </Dialog>
  );
}

function AiMode({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [recipe, setRecipe] = useState<GeneratedRecipe | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pending, start] = useTransition();

  async function generate() {
    setError(null);
    setGenerating(true);
    setRecipe(null);
    setSteps([]);
    try {
      const res = await fetch("/api/ai/recipe-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setRecipe(json);
      setSteps(json.steps ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function save() {
    if (!recipe) return;
    start(async () => {
      const result = await saveGeneratedRecipe({ ...recipe, steps });
      if ("error" in result) setError(result.error!);
      else {
        onClose();
        router.push(`/recipes/${result.id}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder='Try: "high-protein chicken dinner under 30 min, mediterranean"'
        rows={3}
        className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent resize-none"
      />
      <div className="flex gap-2">
        <Btn variant="primary" onClick={generate} disabled={generating || prompt.length < 5}>
          {generating ? "Thinking…" : "Generate"}
        </Btn>
        {recipe ? (
          <Btn variant="outline" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save to library"}
          </Btn>
        ) : null}
      </div>
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      {recipe ? (
        <RecipePreview recipe={recipe} steps={steps} onStepsChange={setSteps} />
      ) : null}
    </div>
  );
}

function UrlMode({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [recipe, setRecipe] = useState<GeneratedRecipe | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [pending, start] = useTransition();

  async function parse() {
    setError(null);
    setFetching(true);
    setRecipe(null);
    setSteps([]);
    try {
      const res = await fetch("/api/ai/recipe-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setRecipe(json);
      setSteps(json.steps ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFetching(false);
    }
  }

  function save() {
    if (!recipe) return;
    start(async () => {
      const result = await saveGeneratedRecipe({
        ...recipe,
        steps,
        source_url: url,
      });
      if ("error" in result) setError(result.error!);
      else {
        onClose();
        router.push(`/recipes/${result.id}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/great-recipe"
          className="flex-1 px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
        />
        <Btn variant="primary" onClick={parse} disabled={fetching || !/^https?:\/\//.test(url)}>
          {fetching ? "Parsing…" : "Fetch"}
        </Btn>
      </div>
      {recipe ? (
        <div className="flex gap-2">
          <Btn variant="outline" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save to library"}
          </Btn>
        </div>
      ) : null}
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      {recipe ? (
        <RecipePreview recipe={recipe} steps={steps} onStepsChange={setSteps} />
      ) : null}
    </div>
  );
}

// Recipe shape returned by /api/ai/recipe-photo — same as the bare
// GeneratedRecipe but with an optional photo_url (resolved by the
// server-side photo chain) so save() can persist it directly.
type ParsedPhotoRecipe = GeneratedRecipe & {
  source_url?: string | null;
  source_image_url?: string | null;
  photo_url?: string | null;
};

function PhotoMode({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [recipe, setRecipe] = useState<ParsedPhotoRecipe | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setParsing(true);
    setRecipe(null);
    setSteps([]);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      setPreviewUrl(dataUrl);
      const res = await fetch("/api/ai/recipe-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data_url: dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setRecipe(json);
      setSteps(json.steps ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setParsing(false);
    }
  }

  function save() {
    if (!recipe) return;
    start(async () => {
      const result = await saveGeneratedRecipe({
        ...recipe,
        steps,
        photo_url: recipe.photo_url ?? null,
        source_image_url: recipe.source_image_url ?? null,
      });
      if ("error" in result) setError(result.error!);
      else {
        onClose();
        router.push(`/recipes/${result.id}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        className="hidden"
      />
      <Body size="sm" dim>
        Snap or upload a cookbook page, magazine clipping, or screenshot.
        Hestia parses it with vision AI.
      </Body>
      <div className="flex gap-2">
        <Btn variant="primary" onClick={() => inputRef.current?.click()} disabled={parsing}>
          {parsing ? "Reading…" : previewUrl ? "Another photo" : "Upload photo"}
        </Btn>
        {recipe ? (
          <Btn variant="outline" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save to library"}
          </Btn>
        ) : null}
      </div>
      {previewUrl ? (
        <div className="rounded-card overflow-hidden border border-ink-l max-h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="recipe source"
            className="w-full max-h-64 object-cover object-top"
          />
        </div>
      ) : null}
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      {recipe ? (
        <RecipePreview recipe={recipe} steps={steps} onStepsChange={setSteps} />
      ) : null}
    </div>
  );
}

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

function ManualMode({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [steps, setSteps] = useState<Step[]>([{ text: "" }, { text: "" }]);
  const [tipsText, setTipsText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [servings, setServings] = useState("4");
  const [prepMin, setPrepMin] = useState("");
  const [cookMin, setCookMin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const totalMin =
    (prepMin ? Number(prepMin) : 0) + (cookMin ? Number(cookMin) : 0);

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  function save() {
    setError(null);
    const ingredients = parseIngredientPaste(ingredientsText);
    const cleanedSteps = steps
      .map((s) => {
        const text = s.text.trim();
        if (!text) return null;
        const timer_sec = s.timer_sec ?? parseStepTimer(text) ?? undefined;
        const step: Step = { text };
        if (timer_sec != null && timer_sec > 0) step.timer_sec = timer_sec;
        if (s.photo_url) step.photo_url = s.photo_url;
        return step;
      })
      .filter((s): s is Step => s != null);
    if (!name.trim() || ingredients.length < 2 || cleanedSteps.length < 2) {
      setError("Need a name, at least 2 ingredients, and 2 steps.");
      return;
    }
    const tips = tipsText
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const servingsNum = servings ? Number(servings) : 4;

    start(async () => {
      const result = await saveGeneratedRecipe({
        name: name.trim(),
        kcal: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        time_min: totalMin > 0 ? totalMin : 0,
        prep_min: prepMin ? Number(prepMin) : 0,
        cook_min: cookMin ? Number(cookMin) : 0,
        servings: servingsNum > 0 ? servingsNum : 4,
        tags,
        tips,
        ingredients,
        steps: cleanedSteps,
      });
      if ("error" in result) setError(result.error!);
      else {
        onClose();
        router.push(`/recipes/${result.id}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Recipe name"
        className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
      />
      <textarea
        value={ingredientsText}
        onChange={(e) => setIngredientsText(e.target.value)}
        placeholder={"Ingredients — one per line\n2 eggs\n1 cup spinach\n1 tbsp olive oil"}
        rows={5}
        className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent resize-none"
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>steps</Label>
          <button
            type="button"
            onClick={() => setSteps((cur) => [...cur, { text: "" }])}
            className="text-ink-3 hover:text-ink text-[12px] flex items-center gap-1"
          >
            <Plus size={12} /> add step
          </button>
        </div>
        <Body size="xs" dim>
          Optional photo per step. Paste multiple lines into a step to split.
        </Body>
        <ol className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2 items-start">
              <Mono className="text-ink-3 text-[13px] mt-2 w-6 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </Mono>
              <StepPhotoControl
                stepIndex={i}
                photoUrl={step.photo_url}
                persistImmediately={false}
                onChange={(url) => updateStep(i, { photo_url: url })}
              />
              <textarea
                value={step.text}
                onChange={(e) => updateStep(i, { text: e.target.value })}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (!text.includes("\n")) return;
                  e.preventDefault();
                  const lines = text
                    .split(/\n/)
                    .map((l) => l.trim())
                    .filter(Boolean);
                  if (lines.length === 0) return;
                  setSteps((cur) => {
                    const next = [...cur];
                    next[i] = { ...next[i]!, text: lines[0]! };
                    const extras = lines.slice(1).map((t) => ({ text: t }));
                    next.splice(i + 1, 0, ...extras);
                    return next;
                  });
                }}
                rows={2}
                placeholder="Step instruction"
                className="flex-1 px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[13px] outline-none focus:border-accent resize-y"
              />
              <button
                type="button"
                onClick={() =>
                  setSteps((cur) =>
                    cur.length <= 2 ? cur : cur.filter((_, j) => j !== i),
                  )
                }
                className="text-ink-3 hover:text-danger p-1 rounded mt-2"
                aria-label="remove step"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          placeholder="Servings"
          inputMode="numeric"
          className="px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[14px] outline-none focus:border-accent"
        />
        <input
          value={prepMin}
          onChange={(e) => setPrepMin(e.target.value)}
          placeholder="Prep (min)"
          inputMode="numeric"
          className="px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[14px] outline-none focus:border-accent"
        />
        <input
          value={cookMin}
          onChange={(e) => setCookMin(e.target.value)}
          placeholder="Bake/cook (min)"
          inputMode="numeric"
          className="px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[14px] outline-none focus:border-accent"
        />
        <input
          value={totalMin > 0 ? String(totalMin) : ""}
          readOnly
          placeholder="Total (min)"
          tabIndex={-1}
          className="px-3 py-2 rounded-thumb border border-ink-l bg-paper-2 text-ink-3 font-mono text-[14px] cursor-default"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>tags</Label>
        <div className="flex flex-wrap gap-2">
          {COMMON_TAGS.map((t) => (
            <Chip
              key={t}
              variant={tags.includes(t) ? "fill" : "default"}
              interactive
              onClick={() =>
                setTags((cur) =>
                  cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
                )
              }
            >
              {t}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label>tips</Label>
        <Body size="xs" dim>
          One tip per line.
        </Body>
        <textarea
          value={tipsText}
          onChange={(e) => setTipsText(e.target.value)}
          placeholder="Use very ripe bananas for extra sweetness."
          rows={3}
          className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent resize-none"
        />
      </div>
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      <div>
        <Btn variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save to library"}
        </Btn>
      </div>
    </div>
  );
}

function RecipePreview({
  recipe,
  steps,
  onStepsChange,
}: {
  recipe: GeneratedRecipe;
  steps: Step[];
  onStepsChange: (steps: Step[]) => void;
}) {
  return (
    <div className="rounded-card border border-ink-l p-5 flex flex-col gap-3 bg-paper-2/40">
      <div className="flex items-center justify-between">
        <H size="sm">{recipe.name}</H>
        <Mono className="text-ink-3 text-[11px]">{recipe.time_min} min</Mono>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          ["kcal", recipe.kcal],
          ["protein", `${recipe.protein}g`],
          ["carbs", `${recipe.carbs}g`],
          ["fat", `${recipe.fat}g`],
        ].map(([k, v]) => (
          <div key={k as string} className="flex flex-col">
            <Label>{k as string}</Label>
            <Mono className="text-ink text-[14px]">{v as string | number}</Mono>
          </div>
        ))}
      </div>
      <div>
        <Label>ingredients</Label>
        <ul className="mt-2 flex flex-col gap-1">
          {recipe.ingredients.slice(0, 8).map((ing, i) => (
            <li key={i} className="text-ink-2 font-sans text-[13px]">
              <Mono className="text-ink-3">
                {formatQuantity(ing.qty)} {ing.unit}
              </Mono>{" "}
              {ing.name}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <Label>steps · add photos</Label>
        <ol className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2 items-start">
              <Mono className="text-ink-3 text-[12px] mt-1 w-5 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </Mono>
              <StepPhotoControl
                stepIndex={i}
                photoUrl={step.photo_url}
                persistImmediately={false}
                onChange={(url) =>
                  onStepsChange(
                    steps.map((s, j) =>
                      j === i ? { ...s, photo_url: url } : s,
                    ),
                  )
                }
              />
              <Body size="sm" className="text-ink-2 pt-1 flex-1 min-w-0">
                {step.text}
              </Body>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
