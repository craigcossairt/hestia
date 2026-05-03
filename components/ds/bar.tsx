import { cn } from "@/lib/utils";

interface BarProps {
  value: number;
  max?: number;
  height?: number;
  color?: string;
  trackClassName?: string;
  fillClassName?: string;
  className?: string;
}

export function Bar({
  value,
  max = 1,
  height = 4,
  color,
  trackClassName,
  fillClassName,
  className,
}: BarProps) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div
      style={{ height }}
      className={cn(
        "rounded-full overflow-hidden bg-ink-l/60",
        trackClassName,
        className,
      )}
    >
      <div
        style={{ width: `${pct}%`, background: color }}
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          !color && "bg-accent",
          fillClassName,
        )}
      />
    </div>
  );
}
