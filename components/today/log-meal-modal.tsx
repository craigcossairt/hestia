"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Dialog, H, Body, Btn, Label, Mono } from "@/components/ds";
import { logCustomMeal } from "@/app/(app)/today/log-actions";
import { createClient } from "@/lib/supabase/client";
import type { Slot } from "@/lib/types/database";
import { cn } from "@/lib/utils";

type Mode = "library" | "quick";

interface RecipeRow {
  id: string;
  name: string;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  time_min: number | null;
}

interface LogMealModalProps {
  open: boolean;
  onClose: () => void;
  defaultSlot?: Slot | null;
}

export function LogMealModal({ open, onClose, defaultSlot }: LogMealModalProps) {
  const [mode, setMode] = useState<Mode>("library");

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <div className="p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Label>log a meal</Label>
          <button onClick={onClose} className="text-ink-3 hover:text-ink text-[13px]">
            close
          </button>
        </div>
        <H size="md" as="h2">
          What did you eat?
        </H>

        <div className="grid grid-cols-2 gap-1 p-1 bg-paper-2 rounded-thumb">
          {(["library", "quick"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-2 rounded-thumb font-sans text-[13px] capitalize transition-colors",
                mode === m
                  ? "bg-card text-ink shadow-[var(--shadow-1)]"
                  : "text-ink-3",
              )}
            >
              {m === "library" ? "From recipes" : "Quick entry"}
            </button>
          ))}
        </div>

        {mode === "library" ? (
          <LibraryMode defaultSlot={defaultSlot ?? null} onLogged={onClose} />
        ) : (
          <QuickMode defaultSlot={defaultSlot ?? null} onLogged={onClose} />
        )}
      </div>
    </Dialog>
  );
}

function LibraryMode({
  defaultSlot,
  onLogged,
}: {
  defaultSlot: Slot | null;
  onLogged: () => void;
}) {
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [slot, setSlot] = useState<Slot | null>(defaultSlot);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("recipes")
      .select("id, name, kcal, protein, carbs, fat, time_min")
      .order("created_at", { ascending: false })
      .limit(80)
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) setError(err.message);
        else setRecipes(data ?? []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return recipes;
    const q = query.toLowerCase();
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, query]);

  function pick(r: RecipeRow) {
    start(async () => {
      const result = await logCustomMeal({
        recipe_id: r.id,
        slot,
        kcal: r.kcal ?? 0,
        protein: r.protein ?? 0,
        carbs: r.carbs ?? 0,
        fat: r.fat ?? 0,
      });
      if (result?.error) setError(result.error);
      else onLogged();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <SlotPicker slot={slot} onChange={setSlot} />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search recipes…"
        className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
      />
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      {loading ? <Body size="sm" dim>loading…</Body> : null}
      {!loading && filtered.length === 0 ? (
        <Body size="sm" dim>
          No recipes. Add one from the Recipes tab first.
        </Body>
      ) : null}
      <div className="flex flex-col max-h-80 overflow-auto -mx-2">
        {filtered.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={pending}
            onClick={() => pick(r)}
            className="text-left px-3 py-2.5 mx-2 rounded-thumb hover:bg-paper-2 transition-colors flex items-center gap-3"
          >
            <div className="flex-1">
              <div className="text-ink font-sans text-[14px]">{r.name}</div>
              <Mono className="text-ink-3 text-[11px]">
                {r.kcal ? `${r.kcal} kcal` : "—"}
                {r.protein ? ` · ${r.protein}g protein` : ""}
              </Mono>
            </div>
            <span className="text-ink-3">log</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickMode({
  defaultSlot,
  onLogged,
}: {
  defaultSlot: Slot | null;
  onLogged: () => void;
}) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [slot, setSlot] = useState<Slot | null>(defaultSlot);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    if (!name.trim()) {
      setError("Give it a name.");
      return;
    }
    start(async () => {
      const result = await logCustomMeal({
        custom_name: name.trim(),
        slot,
        kcal: Number(kcal) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
      });
      if (result?.error) setError(result.error);
      else onLogged();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <SlotPicker slot={slot} onChange={setSlot} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="what did you eat?"
        className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
      />
      <div className="grid grid-cols-4 gap-2">
        <NumInput label="kcal" value={kcal} onChange={setKcal} />
        <NumInput label="protein g" value={protein} onChange={setProtein} />
        <NumInput label="carbs g" value={carbs} onChange={setCarbs} />
        <NumInput label="fat g" value={fat} onChange={setFat} />
      </div>
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      <div className="flex gap-2">
        <Btn variant="primary" onClick={save} disabled={pending}>
          {pending ? "logging…" : "log it"}
        </Btn>
      </div>
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="0"
        className="px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[14px] outline-none focus:border-accent text-center"
      />
    </label>
  );
}

const SLOTS: Slot[] = ["breakfast", "lunch", "dinner", "snack"];

function SlotPicker({
  slot,
  onChange,
}: {
  slot: Slot | null;
  onChange: (s: Slot | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label>slot</Label>
      <div className="flex gap-1.5">
        {SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(slot === s ? null : s)}
            className={cn(
              "px-3 py-1 rounded-full font-sans text-[11.5px] border transition-colors",
              slot === s
                ? "bg-ink text-paper border-ink"
                : "bg-transparent text-ink-2 border-ink-l hover:bg-paper-2",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
