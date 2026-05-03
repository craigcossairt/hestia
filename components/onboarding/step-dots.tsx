import { cn } from "@/lib/utils";

interface StepDotsProps {
  total: number;
  current: number;
}

export function StepDots({ total, current }: StepDotsProps) {
  return (
    <div className="flex gap-1.5 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1 rounded-full transition-all",
            i === current
              ? "w-8 bg-accent"
              : i < current
                ? "w-2 bg-accent/50"
                : "w-2 bg-ink-l",
          )}
        />
      ))}
    </div>
  );
}
