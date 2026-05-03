import { cn } from "@/lib/utils";

interface LabelProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: boolean;
  as?: "div" | "span";
}

export function Label({ accent = false, as: Tag = "div", className, children, ...rest }: LabelProps) {
  return (
    <Tag
      className={cn(
        "font-mono text-[10.5px] tracking-[1.4px] uppercase font-medium",
        accent ? "text-accent" : "text-ink-3",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
