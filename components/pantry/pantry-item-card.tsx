"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { Card, FoodImage, Body, Mono, Chip } from "@/components/ds";
import { deletePantryItem } from "@/app/(app)/pantry/actions";

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
  const f = freshness(expiresAt);
  return (
    <Card className="overflow-hidden flex group relative">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          await deletePantryItem(id);
        })}
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
      <div className="flex-1 px-3 py-2 flex flex-col gap-1 justify-center">
        <Body className="text-ink font-medium capitalize line-clamp-2 leading-tight">
          {name}
        </Body>
        <div className="flex items-center justify-between">
          <Mono className="text-ink-3 text-[11px]">
            {qty} {unit}
          </Mono>
          {f === "fresh" ? <Chip variant="success">fresh</Chip> : null}
          {f === "use_soon" ? <Chip variant="warn">use soon</Chip> : null}
          {f === "expired" ? <Chip variant="danger">expired</Chip> : null}
        </div>
      </div>
    </Card>
  );
}
