import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const btnVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full font-sans font-medium tracking-[-0.1px] cursor-pointer transition-[transform,opacity] duration-75 disabled:opacity-50 disabled:cursor-not-allowed select-none",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper border border-ink hover:bg-ink-2",
        outline: "bg-card text-ink border border-ink-l hover:bg-accent-tint",
        ghost: "bg-transparent text-ink border border-transparent hover:bg-accent-tint",
      },
      size: {
        sm: "text-[12.5px] px-3 py-[7px]",
        md: "text-[14px] px-[18px] py-[11px]",
        lg: "text-[16px] px-6 py-4",
      },
      full: { true: "w-full", false: "" },
    },
    defaultVariants: {
      variant: "outline",
      size: "md",
      full: false,
    },
  },
);

interface BtnProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof btnVariants> {}

export function Btn({ variant, size, full, className, children, ...rest }: BtnProps) {
  return (
    <button className={cn(btnVariants({ variant, size, full }), className)} {...rest}>
      {children}
    </button>
  );
}
