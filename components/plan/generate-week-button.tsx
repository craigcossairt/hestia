"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronDown } from "lucide-react";
import { Btn, Body, Mono, Chip } from "@/components/ds";

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
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [slots, setSlots] = useState<SlotConfig>(
    inferredDefaults ?? { snack: false, dessert: false, beverage: false },
  );
  const [regenerate, setRegenerate] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Tick a soft progress timer while the request is in flight so the long
  // wait feels intentional instead of frozen.
  useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [pending]);

  function toggleSlot(key: keyof SlotConfig) {
    setSlots((cur) => ({ ...cur, [key]: !cur[key] }));
  }

  function generate() {
    setStatus(null);
    start(async () => {
      try {
        const res = await fetch("/api/ai/plan-week", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            week_start: weekStart,
            include_snack: slots.snack,
            include_dessert: slots.dessert,
            include_beverage: slots.beverage,
            regenerate,
          }),
        });
        const raw = await res.text();
        let json: { error?: string; created?: unknown[]; skipped?: number } = {};
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error(
            res.ok
              ? "Server returned a non-JSON response."
              : `Server error (${res.status}).`,
          );
        }
        if (!res.ok) {
          throw new Error(json.error ?? `Generation failed (${res.status}).`);
        }
        const created = json.created?.length ?? 0;
        const skipped = json.skipped ?? 0;
        setStatus(
          `Added ${created} meal${created === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} (already filled)` : ""}.`,
        );
        router.refresh();
      } catch (err) {
        setStatus(`Error: ${(err as Error).message}`);
      }
    });
  }

  const includesExtras = slots.snack || slots.dessert || slots.beverage;
  const slotCount = 3 + (slots.snack ? 1 : 0) + (slots.dessert ? 1 : 0) + (slots.beverage ? 1 : 0);
  const totalCount = slotCount * 7;

  // Soft progress hint that updates as the wait drags on. Tied to the elapsed
  // timer so it feels alive even though the route returns in one shot.
  const progressHint = pending
    ? elapsed < 15
      ? `Drafting ${totalCount} meals…`
      : elapsed < 35
        ? `Researching photos…`
        : elapsed < 60
          ? `Cross-checking ingredients…`
          : `Almost there — finishing up…`
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Btn variant="primary" onClick={generate} disabled={pending}>
          <Sparkles size={14} strokeWidth={1.5} />
          {pending
            ? `${progressHint} (${elapsed}s)`
            : regenerate
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
            className={showOptions ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </Btn>
        {status ? (
          <Body
            size="sm"
            className={status.startsWith("Error") ? "text-danger" : "text-ink-3"}
          >
            {status}
          </Body>
        ) : null}
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
                Wipes any planned-but-not-yet-cooked entries first. Logged or
                skipped meals are never touched.
              </Body>
            </label>
          </div>

          {includesExtras ? (
            <Body size="xs" dim>
              Generating breakfast + lunch + dinner +{" "}
              {[slots.snack && "snack", slots.dessert && "dessert", slots.beverage && "beverage"]
                .filter(Boolean)
                .join(" + ")}{" "}
              for 7 days. This can take 60–120 seconds.
            </Body>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
