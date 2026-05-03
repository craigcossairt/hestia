"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Dialog, H, Body, Btn, Label, Mono } from "@/components/ds";
import { setPlanSlot } from "@/app/(app)/plan/actions";
import { createClient } from "@/lib/supabase/client";
import type { Slot } from "@/lib/types/database";

interface RecipeRow {
  id: string;
  name: string;
  kcal: number | null;
  protein: number | null;
  time_min: number | null;
  tags: string[] | null;
}

interface RecipePickerProps {
  open: boolean;
  onClose: () => void;
  date: string;
  slot: Slot;
}

export function RecipePicker({ open, onClose, date, slot }: RecipePickerProps) {
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("recipes")
      .select("id, name, kcal, protein, time_min, tags")
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
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return recipes;
    const q = query.toLowerCase();
    return recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [recipes, query]);

  function pick(id: string) {
    start(async () => {
      const result = await setPlanSlot({ date, slot, recipe_id: id });
      if (result?.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label>
            {slot} · {new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </Label>
          <button onClick={onClose} className="text-ink-3 hover:text-ink text-[13px]">
            Close
          </button>
        </div>
        <H size="md" as="h2">
          Pick a recipe
        </H>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes…"
          className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
        />
        {loading ? (
          <Body size="sm" dim>
            Loading…
          </Body>
        ) : null}
        {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
        {!loading && filtered.length === 0 ? (
          <Body size="sm" dim>
            No recipes match. Add one from the Recipes tab.
          </Body>
        ) : null}
        <div className="flex flex-col max-h-96 overflow-auto -mx-2">
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={pending}
              onClick={() => pick(r.id)}
              className="text-left px-3 py-3 mx-2 rounded-thumb hover:bg-paper-2 transition-colors flex items-center gap-3"
            >
              <div className="flex-1">
                <div className="text-ink font-sans text-[14px]">{r.name}</div>
                <Mono className="text-ink-3 text-[11px]">
                  {r.time_min ? `${r.time_min} min` : "—"}
                  {r.kcal != null ? ` · ${r.kcal} kcal` : ""}
                  {r.protein != null ? ` · ${r.protein}g protein` : ""}
                </Mono>
              </div>
              <span className="text-ink-3">→</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <Btn variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Btn>
        </div>
      </div>
    </Dialog>
  );
}
