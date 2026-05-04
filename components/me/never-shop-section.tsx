"use client";

import { useState, useTransition } from "react";
import { X, Plus } from "lucide-react";
import { Card, Label, Body, Chip } from "@/components/ds";
import { updateNeverShopItems } from "@/app/(app)/me/actions";

interface NeverShopSectionProps {
  initial: string[];
}

// Simple chip list of ingredient names that /shop should always
// filter out. Targets things the household has effectively-infinite
// supply of — water (fridge dispenser), ice, herbs from a garden,
// etc. Names match against the canonicalised grocery name in
// lib/grocery/derive.ts so plurals + casing don't matter.
export function NeverShopSection({ initial }: NeverShopSectionProps) {
  const [items, setItems] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function persist(next: string[]) {
    setItems(next);
    setStatus(null);
    start(async () => {
      const r = await updateNeverShopItems(next);
      if (r?.error) setStatus(`Error: ${r.error}`);
      else if (r?.items) setItems(r.items); // server may have de-duped
    });
  }

  function add() {
    const trimmed = draft.trim().toLowerCase();
    if (!trimmed) return;
    if (items.includes(trimmed)) {
      setDraft("");
      return;
    }
    persist([...items, trimmed]);
    setDraft("");
  }

  function remove(item: string) {
    persist(items.filter((x) => x !== item));
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label accent>never add to shopping list</Label>
        {status ? (
          <Body
            size="xs"
            className={status.startsWith("Error") ? "text-danger" : "text-success"}
          >
            {status}
          </Body>
        ) : null}
      </div>
      <Body size="xs" dim>
        Items you have an effectively-infinite supply of and never need to
        buy — fridge water, ice, garden herbs. Hestia drops them from /shop
        no matter what a recipe calls for.
      </Body>

      <div className="flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <Chip key={item} variant="dim">
              <span className="inline-flex items-center gap-1.5">
                {item}
                <button
                  type="button"
                  onClick={() => remove(item)}
                  disabled={pending}
                  className="text-ink-3 hover:text-danger"
                  aria-label={`remove ${item}`}
                >
                  <X size={11} />
                </button>
              </span>
            </Chip>
          ))
        ) : (
          <Body size="xs" dim>
            Nothing excluded yet.
          </Body>
        )}
      </div>

      <div className="flex gap-2 border-t border-ink-l/40 pt-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="e.g. water, ice, salt"
          className="flex-1 px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[13px] outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={add}
          disabled={pending || !draft.trim()}
          className="px-3 py-2 rounded-thumb border border-ink-l text-ink-2 hover:text-ink hover:border-ink-3 transition-colors disabled:opacity-40 inline-flex items-center gap-1 text-[13px]"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </Card>
  );
}
