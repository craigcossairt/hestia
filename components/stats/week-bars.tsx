import { Mono } from "@/components/ds";

interface DayPoint {
  date: string;
  weekday: string;
  kcal: number;
  protein: number;
}

interface WeekBarsProps {
  days: DayPoint[];
  target: number;
  metric: "kcal" | "protein";
}

const COLORS = {
  under: "var(--color-warn)",
  on: "var(--color-success)",
  over: "var(--color-danger)",
} as const;

function band(value: number, target: number): keyof typeof COLORS {
  if (target <= 0) return "under";
  const ratio = value / target;
  if (ratio < 0.7) return "under";
  if (ratio > 1.15) return "over";
  return "on";
}

export function WeekBars({ days, target, metric }: WeekBarsProps) {
  const max = Math.max(target * 1.2, ...days.map((d) => d[metric]), 1);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2 h-44">
        {days.map((d) => {
          const value = d[metric];
          const heightPct = Math.max(2, (value / max) * 100);
          const targetPct = (target / max) * 100;
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center gap-1 h-full"
            >
              <div className="relative flex-1 w-full bg-paper-2 rounded-thumb overflow-hidden">
                {target > 0 ? (
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-ink-l"
                    style={{ bottom: `${targetPct}%` }}
                    aria-hidden
                  />
                ) : null}
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-thumb transition-[height] duration-300"
                  style={{
                    height: `${heightPct}%`,
                    background: COLORS[band(value, target)],
                  }}
                  aria-label={`${d.weekday}: ${value}`}
                />
              </div>
              <Mono className="text-ink text-[11px]">{value}</Mono>
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-3">
                {d.weekday.slice(0, 1)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-ink-3">
        <span className="font-mono text-[10px] uppercase tracking-wider">
          target {target}
          {metric === "protein" ? " g" : " kcal"}
        </span>
      </div>
    </div>
  );
}
