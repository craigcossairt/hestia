"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Btn, Body, Card, Label, Mono, H } from "@/components/ds";
import type { SundayPrepPlan } from "@/lib/ai/prompts/sunday-prep";

const LANE_COLORS: Record<string, string> = {
  Oven: "oklch(0.78 0.10 30)",
  Stovetop: "oklch(0.78 0.09 60)",
  "Prep counter": "oklch(0.78 0.08 130)",
};

export function SundayPrepTimeline() {
  const [plan, setPlan] = useState<SundayPrepPlan | null>(null);
  const [request, setRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setLoading(true);
    setPlan(null);
    try {
      const res = await fetch("/api/ai/sunday-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_request: request || undefined }),
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
    <div className="flex flex-col gap-6">
      <Card className="p-5 flex flex-col gap-3">
        <Label>generate this sunday&apos;s prep</Label>
        <Body size="sm" dim>
          Hestia plans a 90-minute parallel cooking session across oven,
          stovetop, and prep counter. Tweak the request below or leave blank
          for a default 5-lunch + 3-dinner plan.
        </Body>
        <textarea
          rows={2}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="Optional: 'high-protein', 'no fish this week', 'use the chicken thighs'"
          className="px-4 py-3 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent resize-none"
        />
        <div>
          <Btn variant="primary" onClick={generate} disabled={loading}>
            <Sparkles size={14} strokeWidth={1.5} />
            {loading ? "Thinking…" : plan ? "Regenerate" : "Generate plan"}
          </Btn>
        </div>
        {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
      </Card>

      {plan ? <PlanView plan={plan} /> : null}
    </div>
  );
}

function PlanView({ plan }: { plan: SundayPrepPlan }) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <Label>parallel timeline</Label>
          <Mono className="text-ink-3 text-[11px]">
            ~{plan.total_minutes} min total
          </Mono>
        </div>
        <Timeline plan={plan} />
        <ul className="flex flex-col gap-1 pt-2 border-t border-ink-l/40">
          {plan.meals_covered.map((m, i) => (
            <li
              key={i}
              className="text-ink-2 font-sans text-[13px] flex items-baseline gap-2"
            >
              <span className="text-ink-3 font-mono text-[10px]">→</span>
              <span>{m}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 flex flex-col gap-3">
          <Label>storage</Label>
          <ul className="flex flex-col gap-2.5">
            {plan.storage.map((s, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <Body size="sm" className="text-ink">
                  {s.item}
                </Body>
                <Mono className="text-ink-3 text-[11px]">
                  {s.container} · {s.keeps}
                </Mono>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5 flex flex-col gap-3">
          <Label>reheat</Label>
          <ul className="flex flex-col gap-2 list-none">
            {plan.reheat.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-ink-3 font-mono text-[10px] mt-1">·</span>
                <Body size="sm" className="text-ink-2">
                  {tip}
                </Body>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Timeline({ plan }: { plan: SundayPrepPlan }) {
  const total = plan.total_minutes;
  const tickEvery = total <= 60 ? 10 : 15;
  const ticks = Array.from(
    { length: Math.floor(total / tickEvery) + 1 },
    (_, i) => i * tickEvery,
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Time axis */}
      <div className="relative h-4 ml-[110px]">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute text-ink-3 font-mono text-[9.5px] uppercase tracking-wider"
            style={{ left: `${(t / total) * 100}%`, transform: "translateX(-50%)" }}
          >
            {t}m
          </div>
        ))}
      </div>

      {/* Lanes */}
      <div className="flex flex-col gap-2">
        {plan.lanes.map((lane) => (
          <div key={lane.label} className="flex items-center gap-3">
            <div className="w-[100px] shrink-0 text-right">
              <Mono className="text-ink-2 text-[12px]">{lane.label}</Mono>
            </div>
            <div className="flex-1 relative h-12 bg-paper-2 rounded-thumb">
              {/* Tick lines */}
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 w-px bg-ink-l/40"
                  style={{ left: `${(t / total) * 100}%` }}
                />
              ))}
              {/* Blocks */}
              {lane.blocks.map((block, i) => {
                const left = (block.start_min / total) * 100;
                const width = (block.duration_min / total) * 100;
                return (
                  <div
                    key={i}
                    className="absolute top-1 bottom-1 rounded-thumb px-2 py-0.5 overflow-hidden flex flex-col justify-center"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: LANE_COLORS[lane.label] ?? "var(--color-accent-tint)",
                    }}
                    title={`${block.name}${block.note ? " — " + block.note : ""} (${block.start_min}-${block.start_min + block.duration_min}min)`}
                  >
                    <span className="text-[10.5px] font-sans font-medium text-black/80 truncate">
                      {block.name}
                    </span>
                    {block.note ? (
                      <span className="text-[9px] font-mono text-black/60 truncate">
                        {block.note}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
