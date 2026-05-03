"use client";

import { cn } from "@/lib/utils";
import { Body, Mono } from "@/components/ds";

interface OptionCardProps {
  label: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
  meta?: string;
}

export function OptionCard({
  label,
  description,
  selected,
  onSelect,
  meta,
}: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left p-4 rounded-card border transition-all flex items-center gap-3",
        selected
          ? "border-accent bg-accent-tint"
          : "border-ink-l bg-card hover:border-ink-3",
      )}
    >
      <div className="flex-1">
        <Body className="text-ink font-medium">{label}</Body>
        {description ? (
          <Body size="sm" dim className="mt-0.5">
            {description}
          </Body>
        ) : null}
      </div>
      {meta ? <Mono className="text-ink-3 text-[12px]">{meta}</Mono> : null}
    </button>
  );
}
