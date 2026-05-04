"use client";

import { useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { Btn, Body, Mono, Chip } from "@/components/ds";
import { StreamingPreviewModal } from "./streaming-preview-modal";

interface SlotConfig {
  snack: boolean;
  dessert: boolean;
  beverage: boolean;
}

interface GenerateWeekButtonProps {
  weekStart?: string;
  // Inferred from active programs (16-8 IF off snacks; Workout Fuel on
  // snacks + beverages). User can still flip individually before generating.
  inferredDefaults?: SlotConfig;
}

export function GenerateWeekButton({
  weekStart,
  inferredDefaults,
}: GenerateWeekButtonProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [slots, setSlots] = useState<SlotConfig>(
    inferredDefaults ?? { snack: false, dessert: false, beverage: false },
  );
  const [regenerate, setRegenerate] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  function toggleSlot(key: keyof SlotConfig) {
    setSlots((cur) => ({ ...cur, [key]: !cur[key] }));
  }

  const includesExtras = slots.snack || slots.dessert || slots.beverage;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Btn variant="primary" onClick={() => setModalOpen(true)}>
            <Sparkles size={14} strokeWidth={1.5} />
            {regenerate
              ? "Regenerate this week's meals"
              : "Generate this week's meals"}
          </Btn>
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => setShowOptions((v) => !v)}
            aria-expanded={showOptions}
          >
            Options
            <ChevronDown
              size={12}
              strokeWidth={1.6}
              className={
                showOptions
                  ? "rotate-180 transition-transform"
                  : "transition-transform"
              }
            />
          </Btn>
        </div>

        {showOptions ? (
          <div className="rounded-card border border-ink-l bg-card p-4 flex flex-col gap-3 max-w-2xl">
            <div className="flex items-baseline justify-between">
              <Mono className="text-ink-3 text-[10.5px] uppercase tracking-[1.4px]">
                Include slots
              </Mono>
              <Body size="xs" dim>
                Breakfast, lunch, and dinner are always generated.
              </Body>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip
                variant={slots.snack ? "fill" : "default"}
                interactive
                onClick={() => toggleSlot("snack")}
              >
                Snack
              </Chip>
              <Chip
                variant={slots.dessert ? "fill" : "default"}
                interactive
                onClick={() => toggleSlot("dessert")}
              >
                Dessert
              </Chip>
              <Chip
                variant={slots.beverage ? "fill" : "default"}
                interactive
                onClick={() => toggleSlot("beverage")}
              >
                Beverage
              </Chip>
            </div>
            {inferredDefaults &&
            (inferredDefaults.snack ||
              inferredDefaults.dessert ||
              inferredDefaults.beverage) ? (
              <Body size="xs" dim>
                Defaults set by your active programs — tweak as needed.
              </Body>
            ) : null}

            <div className="border-t border-ink-l/40 pt-3 flex items-start gap-2">
              <input
                type="checkbox"
                id="regenerate"
                checked={regenerate}
                onChange={(e) => setRegenerate(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              />
              <label htmlFor="regenerate" className="flex flex-col cursor-pointer">
                <span className="font-sans text-[13px] text-ink">
                  Regenerate the whole week
                </span>
                <Body size="xs" dim>
                  Wipes any planned-but-not-yet-cooked entries first. Logged
                  or skipped meals are never touched.
                </Body>
              </label>
            </div>

            {includesExtras ? (
              <Body size="xs" dim>
                Generating breakfast + lunch + dinner +{" "}
                {[
                  slots.snack && "snack",
                  slots.dessert && "dessert",
                  slots.beverage && "beverage",
                ]
                  .filter(Boolean)
                  .join(" + ")}{" "}
                for 7 days. Meals stream in as Hestia drafts them.
              </Body>
            ) : null}
          </div>
        ) : null}
      </div>

      <StreamingPreviewModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        weekStart={weekStart}
        includeSnack={slots.snack}
        includeDessert={slots.dessert}
        includeBeverage={slots.beverage}
        regenerate={regenerate}
      />
    </>
  );
}
