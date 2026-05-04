"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Search, X } from "lucide-react";
import { Chip, Body } from "@/components/ds";
import { RecipeCard } from "./recipe-card";
import { cn } from "@/lib/utils";

type AttrFilterId = "under-30min" | "high-protein" | "vegetarian" | "pantry-ready";
type MealTypeId = "breakfast" | "lunch" | "dinner" | "dessert" | "snack" | "beverage";
type SourceId = "ai" | "url" | "manual" | "seed";

const ATTR_FILTERS: Array<{ id: AttrFilterId; label: string }> = [
  { id: "under-30min", label: "Under 30 min" },
  { id: "high-protein", label: "High protein" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "pantry-ready", label: "In stock" },
];

const MEAL_TYPES: Array<{ id: MealTypeId; label: string }> = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "dessert", label: "Dessert" },
  { id: "snack", label: "Snack" },
  { id: "beverage", label: "Beverage" },
];

const SOURCES: Array<{ id: SourceId; label: string }> = [
  { id: "ai", label: "AI generated" },
  { id: "url", label: "From URL" },
  { id: "manual", label: "Manual" },
  { id: "seed", label: "Starter library" },
];

interface RecipeRow {
  id: string;
  name: string;
  photo_url: string | null;
  kcal: number | null;
  time_min: number | null;
  protein: number | null;
  tags: string[];
  ingredients_json?: Array<{ name: string }>;
  owner_id?: string | null;
  source_url?: string | null;
}

interface LibraryControlsProps {
  recipes: RecipeRow[];
  saved: Set<string>;
  ratings: Map<string, number>;
  pantryNames: string[];
  emptyMessage: string;
  // Used to identify which user owns each recipe — drives the Manual /
  // AI / URL / Seed source filter.
  currentUserId?: string | null;
}

function recipeSource(r: RecipeRow, currentUserId: string | null): SourceId {
  if (r.owner_id == null) return "seed";
  if ((r.tags ?? []).map((t) => t.toLowerCase()).includes("auto-generated"))
    return "ai";
  if (r.source_url) return "url";
  // owner_id matches current user, no auto-gen tag, no source_url → manual.
  if (currentUserId && r.owner_id === currentUserId) return "manual";
  // Owned by someone else (shouldn't happen given RLS, but bucket sanely).
  return "manual";
}

export function LibraryControls({
  recipes,
  saved,
  ratings,
  pantryNames,
  emptyMessage,
  currentUserId = null,
}: LibraryControlsProps) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Set<AttrFilterId>>(new Set());
  const [mealTypes, setMealTypes] = useState<Set<MealTypeId>>(new Set());
  const [sources, setSources] = useState<Set<SourceId>>(new Set());
  const pantrySet = useMemo(
    () => new Set(pantryNames.map((n) => n.toLowerCase())),
    [pantryNames],
  );

  function toggle(id: AttrFilterId) {
    setFilters((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleMealType(id: MealTypeId) {
    setMealTypes((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSource(id: SourceId) {
    setSources((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (q) {
        const haystack = `${r.name} ${(r.tags ?? []).join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (mealTypes.size > 0) {
        const tagSet = new Set((r.tags ?? []).map((t) => t.toLowerCase()));
        let matched = false;
        for (const mt of mealTypes) {
          if (tagSet.has(mt)) {
            matched = true;
            break;
          }
        }
        if (!matched) return false;
      }
      if (sources.size > 0 && !sources.has(recipeSource(r, currentUserId))) {
        return false;
      }
      if (filters.has("under-30min") && (r.time_min ?? 999) > 30) return false;
      if (filters.has("high-protein") && (r.protein ?? 0) < 25) return false;
      if (
        filters.has("vegetarian") &&
        !(r.tags ?? []).some((t) => /vegetarian|vegan/i.test(t))
      ) {
        return false;
      }
      if (filters.has("pantry-ready")) {
        const ing = r.ingredients_json ?? [];
        if (ing.length === 0) return false;
        const have = ing.filter((i) =>
          pantrySet.has(i.name.toLowerCase()),
        ).length;
        if (have / ing.length < 0.7) return false;
      }
      return true;
    });
  }, [recipes, query, filters, mealTypes, sources, pantrySet, currentUserId]);

  const totalFilters = filters.size + mealTypes.size + sources.size;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <SearchInput value={query} onChange={setQuery} />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3 mr-1">
          meal
        </span>
        {MEAL_TYPES.map((m) => (
          <Chip
            key={m.id}
            variant={mealTypes.has(m.id) ? "fill" : "default"}
            interactive
            onClick={() => toggleMealType(m.id)}
          >
            {m.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3 mr-1">
          attributes
        </span>
        {ATTR_FILTERS.map((f) => (
          <Chip
            key={f.id}
            variant={filters.has(f.id) ? "fill" : "default"}
            interactive
            onClick={() => toggle(f.id)}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3 mr-1">
          source
        </span>
        {SOURCES.map((s) => (
          <Chip
            key={s.id}
            variant={sources.has(s.id) ? "fill" : "default"}
            interactive
            onClick={() => toggleSource(s.id)}
          >
            {s.label}
          </Chip>
        ))}
        {totalFilters > 0 ? (
          <Chip
            variant="dim"
            interactive
            onClick={() => {
              setFilters(new Set());
              setMealTypes(new Set());
              setSources(new Set());
            }}
          >
            Clear ×
          </Chip>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-ink-l p-10 text-center">
          <Body dim>
            {recipes.length === 0
              ? emptyMessage
              : "Nothing matches those filters. Loosen them or clear to see all."}
          </Body>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {filtered.map((r) => (
            <RecipeCard
              key={r.id}
              id={r.id}
              name={r.name}
              photoUrl={r.photo_url}
              kcal={r.kcal}
              timeMin={r.time_min}
              rating={ratings.get(r.id) ?? 0}
              saved={saved.has(r.id)}
              tags={r.tags ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<unknown>(null);
  const supportedRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    supportedRef.current = !!SR;
  }, []);

  function toggleVoice() {
    if (typeof window === "undefined") return;
    const SR =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SR) return;

    if (listening) {
      const r = recognitionRef.current as { stop?: () => void } | null;
      r?.stop?.();
      setListening(false);
      return;
    }
    type SRInstance = {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    const recognition = new (SR as new () => SRInstance)();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) onChange(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }

  return (
    <div className="relative flex-1 flex items-center">
      <Search
        size={16}
        strokeWidth={1.5}
        className="absolute left-3 text-ink-3"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search recipes…"
        className="flex-1 pl-9 pr-20 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
      />
      <div className="absolute right-2 flex items-center gap-1">
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="p-1.5 rounded-full text-ink-3 hover:text-ink hover:bg-paper-2"
            aria-label="clear"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={toggleVoice}
          aria-label={listening ? "stop listening" : "voice search"}
          className={cn(
            "p-1.5 rounded-full transition-colors",
            listening
              ? "bg-accent text-paper animate-pulse"
              : "text-ink-3 hover:text-ink hover:bg-paper-2",
          )}
        >
          <Mic size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
