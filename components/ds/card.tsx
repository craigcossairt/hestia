"use client";
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  accent?: boolean;
  interactive?: boolean;
  as?: "div" | "article" | "section" | "li";
}

export function Card({
  accent = false,
  interactive = false,
  as: Tag = "div",
  className,
  children,
  onClick,
  ...rest
}: CardProps) {
  const isClickable = interactive || !!onClick;
  const Comp = Tag as React.ElementType;
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "bg-card rounded-card border shadow-[var(--shadow-1)] transition-shadow duration-150",
        accent ? "border-accent" : "border-ink-l",
        isClickable && "cursor-pointer hover:shadow-[var(--shadow-2)]",
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
}
