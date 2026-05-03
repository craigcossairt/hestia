"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Search, X } from "lucide-react";
import { Chip, Body } from "@/components/ds";
import { RecipeCard } from "./recipe-card";
import { cn } from "@/lib/utils";

type FilterId = "under-30min" | "high-protein" | "vegetarian" | "pantry-ready";

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "under-30min", label: "under 30 min" },
  { id: "high-protein", label: "high protein" },
  { id: "vegetarian", label: "vegetarian" },
  { id: "pantry-ready", label: "pantry-ready" },
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
}

interface LibraryControlsProps {
  recipes: RecipeRow[];
  saved: Set<string>;
  ratings: Map<string, number>;
  pantryNames: string[];
  emptyMessage: string;
}

export function LibraryControls({
  recipes,
  saved,
  ratings,
  pantryNames,
  emptyMessage,
}: LibraryControlsProps) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Set<FilterId>>(new Set());
  const pantrySet = useMemo(
    () => new Set(pantryNames.map((n) => n.toLowerCase())),
    [pantryNames],
  );

  function toggle(id: FilterId) {
    setFilters((cur) => {
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
  }, [recipes, query, filters, pantrySet]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <SearchInput value={query} onChange={setQuery} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            variant={filters.has(f.id) ? "fill" : "default"}
            interactive
            onClick={() => toggle(f.id)}
          >
            {f.label}
          </Chip>
        ))}
        {filters.size > 0 ? (
          <Chip variant="dim" interactive onClick={() => setFilters(new Set())}>
            clear ×
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
        placeholder="search recipes…"
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
