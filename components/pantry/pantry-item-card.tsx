"use client";

import { useState, useTransition } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Card, FoodImage, Body, Mono, Chip } from "@/components/ds";
import {
  deletePantryItem,
  updatePantryQty,
} from "@/app/(app)/inventory/actions";

interface PantryItemCardProps {
  id: string;
  name: string;
  qty: number;
  unit: string;
  expiresAt: string | null;
  photoUrl: string | null;
}

function freshness(expiresAt: string | null): "fresh" | "use_soon" | "expired" | null {
  if (!expiresAt) return null;
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  const diffDays = (exp - now) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "expired";
  if (diffDays < 3) return "use_soon";
  return "fresh";
}

export function PantryItemCard({
  id,
  name,
  qty,
  unit,
  expiresAt,
  photoUrl,
}: PantryItemCardProps) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<string>(String(qty));
  const f = freshness(expiresAt);

  function commit(next: number) {
    if (Number.isNaN(next) || next < 0) {
      setDraft(String(qty));
      return;
    }
    if (next === qty) return;
    start(async () => {
      const result = await updatePantryQty(id, next);
      if (result?.error) setDraft(String(qty));
    });
  }

  function bump(delta: number) {
    const next = Math.max(0, Math.round((qty + delta) * 100) / 100);
    setDraft(String(next));
    commit(next);
  }

  return (
    <Card className="overflow-hidden flex group relative">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await deletePantryItem(id);
          })
        }
        className="absolute top-1.5 right-1.5 z-10 p-1 rounded-full bg-card/80 text-ink-3 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="remove"
      >
        <X size={12} strokeWidth={1.5} />
      </button>
      <div className="w-20 h-20 shrink-0">
        <FoodImage
          name={name}
          src={photoUrl ?? undefined}
          height={80}
          rounded={false}
          showLabel={false}
        />
      </div>
      <div className="flex-1 px-3 py-2 flex flex-col gap-1.5 justify-center min-w-0">
        <Body className="text-ink font-medium capitalize line-clamp-2 leading-tight">
          {name}
        </Body>
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-0.5">
            <button
              type="button"
              disabled={pending || qty <= 0}
              onClick={() => bump(-1)}
              className="w-5 h-5 flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-paper-2 transition-colors disabled:opacity-40"
              aria-label="decrease"
            >
              <Minus size={11} strokeWidth={1.8} />
            </button>
            <input
              type="number"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(Number(draft))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-10 bg-transparent text-ink font-mono text-[12px] text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:bg-paper-2 rounded"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => bump(1)}
              className="w-5 h-5 flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-paper-2 transition-colors"
              aria-label="increase"
            >
              <Plus size={11} strokeWidth={1.8} />
            </button>
            <Mono className="text-ink-3 text-[11px] ml-1">{unit}</Mono>
          </div>
          {f === "fresh" ? <Chip variant="success">Fresh</Chip> : null}
          {f === "use_soon" ? <Chip variant="warn">Use soon</Chip> : null}
          {f === "expired" ? <Chip variant="danger">Expired</Chip> : null}
        </div>
      </div>
    </Card>
  );
}
