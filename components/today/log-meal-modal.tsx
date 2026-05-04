"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
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
  // null/undefined = self; "memberId" = log to that family member's column.
  familyMemberId?: string | null;
  // Display label for context ("for Sam", "for you").
  scopeLabel?: string;
}

export function LogMealModal({
  open,
  onClose,
  defaultSlot,
  familyMemberId,
  scopeLabel,
}: LogMealModalProps) {
  const [mode, setMode] = useState<Mode>("library");

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <div className="p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Label accent>log a meal</Label>
          <button onClick={onClose} className="text-ink-3 hover:text-ink text-[13px]">
            Close
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <H size="md" as="h2">
            What did you eat?
          </H>
          {scopeLabel ? (
            <Body size="xs" dim>
              Logging {scopeLabel}.
            </Body>
          ) : null}
        </div>

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
          <LibraryMode
            defaultSlot={defaultSlot ?? null}
            familyMemberId={familyMemberId ?? null}
            onLogged={onClose}
          />
        ) : (
          <QuickMode
            defaultSlot={defaultSlot ?? null}
            familyMemberId={familyMemberId ?? null}
            onLogged={onClose}
          />
        )}
      </div>
    </Dialog>
  );
}

function LibraryMode({
  defaultSlot,
  familyMemberId,
  onLogged,
}: {
  defaultSlot: Slot | null;
  familyMemberId: string | null;
  onLogged: () => void;
}) {
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [slot, setSlot] = useState<Slot | null>(defaultSlot);
  const [time, setTime] = useState<string>(nowHHmm());

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
        family_member_id: familyMemberId,
        logged_at: composeLoggedAt(time),
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
      <TimePicker time={time} onChange={setTime} />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search recipes…"
        className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
      />
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      {loading ? <Body size="sm" dim>Loading…</Body> : null}
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
            <span className="text-ink-3">Log</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickMode({
  defaultSlot,
  familyMemberId,
  onLogged,
}: {
  defaultSlot: Slot | null;
  familyMemberId: string | null;
  onLogged: () => void;
}) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [slot, setSlot] = useState<Slot | null>(defaultSlot);
  const [time, setTime] = useState<string>(nowHHmm());
  const [pending, start] = useTransition();
  const [estimating, setEstimating] = useState(false);
  const [estimateBasis, setEstimateBasis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function estimate() {
    setError(null);
    setEstimateBasis(null);
    if (!name.trim()) {
      setError("Type what you ate first.");
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch("/api/ai/estimate-macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not estimate.");
        return;
      }
      setKcal(String(data.kcal));
      setProtein(String(data.protein));
      setCarbs(String(data.carbs));
      setFat(String(data.fat));
      if (data.basis) setEstimateBasis(data.basis);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEstimating(false);
    }
  }

  function save() {
    setError(null);
    if (!name.trim()) {
      setError("Give it a name.");
      return;
    }
    start(async () => {
      // If macros are still empty, run an estimate first so the log isn't
      // silently zero kcal.
      let nKcal = Number(kcal);
      let nProtein = Number(protein);
      let nCarbs = Number(carbs);
      let nFat = Number(fat);
      if (!kcal && !protein && !carbs && !fat) {
        try {
          const res = await fetch("/api/ai/estimate-macros", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: name.trim() }),
          });
          if (res.ok) {
            const data = await res.json();
            nKcal = data.kcal;
            nProtein = data.protein;
            nCarbs = data.carbs;
            nFat = data.fat;
          }
        } catch {
          // Fall through with zeroed macros.
        }
      }
      const result = await logCustomMeal({
        custom_name: name.trim(),
        slot,
        family_member_id: familyMemberId,
        logged_at: composeLoggedAt(time),
        kcal: nKcal || 0,
        protein: nProtein || 0,
        carbs: nCarbs || 0,
        fat: nFat || 0,
      });
      if (result?.error) setError(result.error);
      else onLogged();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <SlotPicker slot={slot} onChange={setSlot} />
      <TimePicker time={time} onChange={setTime} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="What did you eat?"
        className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
      />
      <div className="flex items-center justify-between gap-2">
        <Mono className="text-ink-3 text-[10.5px] uppercase tracking-[1.4px]">
          Macros
        </Mono>
        <Btn
          variant="ghost"
          size="sm"
          type="button"
          onClick={estimate}
          disabled={estimating || pending}
        >
          <Sparkles size={12} strokeWidth={1.6} />
          {estimating ? "Estimating…" : "Estimate"}
        </Btn>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <NumInput label="kcal" value={kcal} onChange={setKcal} />
        <NumInput label="protein g" value={protein} onChange={setProtein} />
        <NumInput label="carbs g" value={carbs} onChange={setCarbs} />
        <NumInput label="fat g" value={fat} onChange={setFat} />
      </div>
      {estimateBasis ? (
        <Body size="xs" dim>
          Hestia assumed: {estimateBasis}. Adjust if needed.
        </Body>
      ) : (
        <Body size="xs" dim>
          Leave macros blank and Hestia will estimate when you log.
        </Body>
      )}
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      <div className="flex gap-2">
        <Btn variant="primary" onClick={save} disabled={pending}>
          {pending ? "Logging…" : "Log it"}
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

const SLOTS: Slot[] = [
  "breakfast",
  "lunch",
  "dinner",
  "dessert",
  "snack",
  "beverage",
];

function SlotPicker({
  slot,
  onChange,
}: {
  slot: Slot | null;
  onChange: (s: Slot | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Label>slot</Label>
      <div className="flex gap-1.5 flex-wrap">
        {SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(slot === s ? null : s)}
            className={cn(
              "px-3 py-1 rounded-full font-sans text-[11.5px] border transition-colors capitalize",
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

function TimePicker({
  time,
  onChange,
}: {
  time: string;
  onChange: (t: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label>time</Label>
      <input
        type="time"
        value={time}
        onChange={(e) => onChange(e.target.value)}
        className="bg-card text-ink font-mono text-[13px] outline-none px-2.5 py-1 rounded-thumb border border-ink-l focus:border-accent"
      />
      <Body size="xs" dim>
        Defaults to now.
      </Body>
    </div>
  );
}

// Combine the user-selected slot/time into the timestamp the log row stores.
// Time is HH:mm; we slap today's date on it.
function composeLoggedAt(time: string): string {
  if (!time) return new Date().toISOString();
  const today = new Date();
  const [h, m] = time.split(":").map(Number);
  today.setHours(h ?? 0, m ?? 0, 0, 0);
  return today.toISOString();
}

function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
