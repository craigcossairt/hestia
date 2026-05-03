"use client";

import { useState } from "react";
import { Drawer, H, Body, Label, Btn, Card, Mono } from "@/components/ds";

interface Substitution {
  name: string;
  qty_text: string;
  reason: string;
}

interface SubstitutionDrawerProps {
  open: boolean;
  onClose: () => void;
  ingredient: string;
  recipeName: string;
}

export function SubstitutionDrawer({
  open,
  onClose,
  ingredient,
  recipeName,
}: SubstitutionDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Substitution[]>([]);

  async function fetchOptions() {
    setError(null);
    setLoading(true);
    setOptions([]);
    try {
      const res = await fetch("/api/ai/substitutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredient, recipe_name: recipeName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setOptions(json.options);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} side="right">
      <div className="p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Label>substitute</Label>
          <button onClick={onClose} className="text-ink-3 hover:text-ink text-[13px]">
            Close
          </button>
        </div>
        <H size="md" as="h2">
          {ingredient}
        </H>
        <Body size="sm" dim>
          Hestia can suggest swaps based on what you already have, allergies,
          and the recipe&apos;s purpose.
        </Body>

        {options.length === 0 && !loading ? (
          <Btn variant="primary" onClick={fetchOptions}>
            Ask Hestia
          </Btn>
        ) : null}

        {loading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 rounded-card border border-ink-l bg-paper-2/40 animate-pulse"
              />
            ))}
          </div>
        ) : null}

        {error ? (
          <Body size="sm" className="text-danger">
            {error}
          </Body>
        ) : null}

        {options.length > 0 ? (
          <div className="flex flex-col gap-3">
            {options.map((opt, i) => (
              <Card key={i} className="p-4 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Body className="text-ink font-medium">{opt.name}</Body>
                  <Mono className="text-ink-3 text-[12px]">{opt.qty_text}</Mono>
                </div>
                <Body size="sm" dim>
                  {opt.reason}
                </Body>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
