import { Mono } from "@/components/ds";
import { kgToLb } from "@/lib/units";

interface Point {
  date: string;
  value_kg: number;
}

interface WeightChartProps {
  points: Point[]; // chronological
}

const W = 600;
const H = 160;
const PAD = { left: 36, right: 12, top: 12, bottom: 24 };

export function WeightChart({ points }: WeightChartProps) {
  if (points.length < 2) {
    return (
      <div className="text-ink-3 text-[12px] font-mono uppercase tracking-wider py-8 text-center">
        log at least two weights to see a trend
      </div>
    );
  }

  const lbs = points.map((p) => kgToLb(p.value_kg));
  const min = Math.floor(Math.min(...lbs) - 1);
  const max = Math.ceil(Math.max(...lbs) + 1);
  const range = Math.max(1, max - min);

  const xs = points.map((_, i) => {
    if (points.length === 1) return PAD.left;
    return PAD.left + ((W - PAD.left - PAD.right) * i) / (points.length - 1);
  });
  const ys = lbs.map(
    (v) => PAD.top + ((max - v) / range) * (H - PAD.top - PAD.bottom),
  );

  const path = points
    .map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i]} ${ys[i]}`)
    .join(" ");

  const first = lbs[0];
  const last = lbs[lbs.length - 1];
  const delta = last - first;
  const deltaSign = delta > 0 ? "+" : "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <Mono className="text-ink text-[24px] font-medium">{last} lb</Mono>
        <Mono
          className={`text-[12px] ${delta === 0 ? "text-ink-3" : delta < 0 ? "text-success" : "text-warm"}`}
        >
          {deltaSign}
          {delta} lb · {points.length} entries
        </Mono>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Y-axis ticks */}
        {[0, 0.5, 1].map((t) => {
          const y = PAD.top + t * (H - PAD.top - PAD.bottom);
          const v = Math.round(max - t * range);
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--color-ink-l)"
                strokeOpacity={0.5}
                strokeDasharray="2 4"
              />
              <text
                x={PAD.left - 4}
                y={y + 4}
                fontSize="10"
                fill="var(--color-ink-3)"
                fontFamily="JetBrains Mono, monospace"
                textAnchor="end"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* line */}
        <path
          d={path}
          stroke="var(--color-accent)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* points */}
        {points.map((p, i) => (
          <circle
            key={p.date + i}
            cx={xs[i]}
            cy={ys[i]}
            r={3}
            fill="var(--color-accent)"
          />
        ))}
      </svg>
    </div>
  );
}
