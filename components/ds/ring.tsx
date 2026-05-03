interface RingProps {
  value: number;
  size?: number;
  stroke?: number;
  label?: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  className?: string;
}

export function Ring({
  value,
  size = 160,
  stroke = 8,
  label,
  sub,
  color,
  className,
}: RingProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, value)));
  return (
    <div
      className={`relative shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-ink-l)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? "var(--color-accent)"}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label !== undefined && (
          <div
            className="font-display font-medium text-ink leading-none tracking-[-0.5px]"
            style={{ fontSize: size * 0.24, fontVariationSettings: '"opsz" 144' }}
          >
            {label}
          </div>
        )}
        {sub !== undefined && (
          <div className="font-mono text-[9.5px] text-ink-3 uppercase tracking-[1px] mt-1">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
