import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const chipVariants = cva(
  "inline-flex items-center font-sans text-[11.5px] px-2.5 py-1 rounded-full whitespace-nowrap border transition-colors",
  {
    variants: {
      variant: {
        default: "bg-transparent border-ink-l text-ink-2",
        accent: "bg-accent-tint border-accent text-accent",
        fill: "bg-ink border-ink text-paper",
        success:
          "bg-[color-mix(in_oklab,var(--color-success)_8%,transparent)] border-success text-success",
        warn: "bg-[color-mix(in_oklab,var(--color-warn)_8%,transparent)] border-warn text-warn",
        danger:
          "bg-[color-mix(in_oklab,var(--color-danger)_8%,transparent)] border-danger text-danger",
        dim: "bg-transparent border-ink-l text-ink-3",
      },
      interactive: { true: "cursor-pointer", false: "cursor-default" },
    },
    defaultVariants: { variant: "default", interactive: false },
  },
);

interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof chipVariants> {
  as?: "button" | "span";
}

export function Chip({
  variant,
  interactive,
  as: Tag,
  className,
  children,
  onClick,
  ...rest
}: ChipProps) {
  const Comp = (Tag ?? (onClick ? "button" : "span")) as React.ElementType;
  return (
    <Comp
      onClick={onClick}
      className={cn(
        chipVariants({ variant, interactive: interactive ?? !!onClick }),
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
}
