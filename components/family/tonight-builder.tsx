"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, Label, Body, Btn, Mono, H } from "@/components/ds";
import { createClient } from "@/lib/supabase/client";
import type { FamilyTonightPlan } from "@/lib/ai/prompts/family-tonight";

interface RecipeOption {
  id: string;
  name: string;
}

export function TonightBuilder() {
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [recipeId, setRecipeId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<FamilyTonightPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase
      .from("recipes")
      .select("id, name")
      .order("created_at", { ascending: false })
      .limit(80)
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) setError(err.message);
        else setRecipes(data ?? []);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, query]);

  async function generate() {
    if (!recipeId) return;
    setError(null);
    setLoading(true);
    setPlan(null);
    try {
      const res = await fetch("/api/ai/family-tonight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe_id: recipeId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setPlan(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5 flex flex-col gap-3">
        <Label accent>tonight&apos;s plate builder</Label>
        <Body size="sm" dim>
          Pick a recipe — Hestia explains how to make it once and have it land
          well for everyone.
        </Body>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes…"
          className="px-4 py-2.5 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
        />
        <select
          value={recipeId}
          onChange={(e) => setRecipeId(e.target.value)}
          className="px-3 py-2.5 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
        >
          <option value="">— Pick a recipe —</option>
          {filtered.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <div>
          <Btn
            variant="primary"
            onClick={generate}
            disabled={loading || !recipeId}
          >
            <Sparkles size={14} strokeWidth={1.5} />
            {loading ? "Thinking…" : "Build tonight"}
          </Btn>
        </div>
        {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      </Card>

      {plan ? (
        <Card className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label>tonight</Label>
            <H size="md" as="h3">
              {plan.recipe_name}
            </H>
          </div>
          <Body size="md" className="text-ink">
            {plan.shared_base}
          </Body>

          <div className="flex flex-col gap-3">
            {plan.plates.map((plate) => (
              <div
                key={plate.member_name}
                className="rounded-thumb border border-ink-l bg-paper-2/40 p-4 flex flex-col gap-2"
              >
                <div className="flex items-baseline justify-between">
                  <Label>{plate.member_name}</Label>
                  <Mono className="text-ink-3 text-[11px]">{plate.portion_text}</Mono>
                </div>
                <Body size="sm" className="text-ink">
                  {plate.plate_description}
                </Body>
                {plate.modifications.length > 0 ? (
                  <ul className="flex flex-col gap-1 mt-1">
                    {plate.modifications.map((m, i) => (
                      <li
                        key={i}
                        className="text-ink-2 font-sans text-[12.5px] flex items-baseline gap-2"
                      >
                        <span className="text-ink-3 font-mono text-[10px]">↳</span>
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>

          {plan.allergen_notes.length > 0 ? (
            <div className="rounded-thumb border border-warn/40 bg-[color-mix(in_oklab,var(--color-warn)_6%,transparent)] p-3 flex flex-col gap-1">
              <Label accent>allergen notes</Label>
              <ul className="flex flex-col gap-1">
                {plan.allergen_notes.map((n, i) => (
                  <li
                    key={i}
                    className="text-ink-2 font-sans text-[13px]"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="border-t border-ink-l/40 pt-3">
            <Body size="sm" className="text-ink-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3 mr-2">
                prep tip
              </span>
              {plan.prep_tip}
            </Body>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
