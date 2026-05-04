"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, H, Body, Btn, Label, Mono } from "@/components/ds";
import { saveGeneratedRecipe } from "@/app/(app)/recipes/actions";
import { cn } from "@/lib/utils";
import type { GeneratedRecipe } from "@/lib/ai/prompts/recipe";

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
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pending, start] = useTransition();

  async function generate() {
    setError(null);
    setGenerating(true);
    setRecipe(null);
    try {
      const res = await fetch("/api/ai/recipe-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setRecipe(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function save() {
    if (!recipe) return;
    start(async () => {
      const result = await saveGeneratedRecipe(recipe);
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
      {recipe ? <RecipePreview recipe={recipe} /> : null}
    </div>
  );
}

function UrlMode({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [recipe, setRecipe] = useState<GeneratedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [pending, start] = useTransition();

  async function parse() {
    setError(null);
    setFetching(true);
    setRecipe(null);
    try {
      const res = await fetch("/api/ai/recipe-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setRecipe(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFetching(false);
    }
  }

  function save() {
    if (!recipe) return;
    start(async () => {
      const result = await saveGeneratedRecipe({ ...recipe, source_url: url });
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
      {recipe ? <RecipePreview recipe={recipe} /> : null}
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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setParsing(false);
    }
  }

  function save() {
    if (!recipe) return;
    start(async () => {
      // Pass the resolved photo_url through so the recipe card has an
      // image. The server-side photo chain (Pexels / Brave / AI gen)
      // already populated it; saveGeneratedRecipe just persists what
      // it gets.
      const result = await saveGeneratedRecipe({
        ...recipe,
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
      {recipe ? <RecipePreview recipe={recipe} /> : null}
    </div>
  );
}

function ManualMode({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    const ingredients = ingredientsText
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        // crude parse: "2 eggs" → qty 2, unit each, name eggs
        const m = line.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+)$/);
        if (m) {
          return {
            qty: Number(m[1]),
            unit: m[2] ?? "each",
            name: m[3].trim(),
          };
        }
        return { qty: 1, unit: "each", name: line };
      });
    const steps = stepsText
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((text) => ({ text }));
    if (!name.trim() || ingredients.length < 2 || steps.length < 2) {
      setError("Need a name, at least 2 ingredients, and 2 steps.");
      return;
    }
    start(async () => {
      const result = await saveGeneratedRecipe({
        name: name.trim(),
        kcal: kcal ? Number(kcal) : 0,
        protein: protein ? Number(protein) : 0,
        carbs: 0,
        fat: 0,
        time_min: time ? Number(time) : 0,
        servings: 4,
        tags: [],
        ingredients,
        steps,
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
      <textarea
        value={stepsText}
        onChange={(e) => setStepsText(e.target.value)}
        placeholder={"Steps — one per line\nHeat oil in pan\nAdd eggs and cook 2 min\nAdd spinach, fold"}
        rows={5}
        className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent resize-none"
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          placeholder="kcal"
          inputMode="numeric"
          className="px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[14px] outline-none focus:border-accent"
        />
        <input
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
          placeholder="Protein (g)"
          inputMode="numeric"
          className="px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[14px] outline-none focus:border-accent"
        />
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="Time (min)"
          inputMode="numeric"
          className="px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[14px] outline-none focus:border-accent"
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

function RecipePreview({ recipe }: { recipe: GeneratedRecipe }) {
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
                {ing.qty} {ing.unit}
              </Mono>{" "}
              {ing.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
