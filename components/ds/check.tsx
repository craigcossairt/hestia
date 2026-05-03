"use client";
import { cn } from "@/lib/utils";

interface CheckProps {
  checked: boolean;
  size?: number;
  onChange?: (next: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export function Check({
  checked,
  size = 18,
  onChange,
  className,
  disabled,
}: CheckProps) {
  const interactive = !!onChange && !disabled;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={interactive ? () => onChange(!checked) : undefined}
      style={{ width: size, height: size }}
      className={cn(
        "rounded-[5px] border-[1.6px] flex items-center justify-center shrink-0 transition-colors duration-150",
        checked ? "bg-accent border-accent" : "bg-transparent border-ink-3",
        interactive ? "cursor-pointer" : "cursor-default",
        disabled && "opacity-50",
        className,
      )}
    >
      {checked && (
        <svg
          width={size * 0.6}
          height={size * 0.6}
          viewBox="0 0 12 12"
          stroke="var(--color-paper)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 6.5L5 9.5L10 3" />
        </svg>
      )}
    </button>
  );
}
