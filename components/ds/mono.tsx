import { cn } from "@/lib/utils";

interface MonoProps extends React.HTMLAttributes<HTMLSpanElement> {}

export function Mono({ className, children, ...rest }: MonoProps) {
  return (
    <span
      className={cn("font-mono [font-variant-numeric:tabular-nums]", className)}
      {...rest}
    >
      {children}
    </span>
  );
}
