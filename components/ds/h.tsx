import { cn } from "@/lib/utils";

type HSize = "xl" | "lg" | "md" | "sm";

const sizeClass: Record<HSize, string> = {
  xl: "text-[44px] tracking-[-0.0273em]",
  lg: "text-[28px] tracking-[-0.0179em]",
  md: "text-[22px] tracking-[-0.0227em]",
  sm: "text-[18px] tracking-[-0.0278em]",
};

interface HProps extends React.HTMLAttributes<HTMLHeadingElement> {
  size?: HSize;
  as?: "h1" | "h2" | "h3" | "h4";
}

export function H({ size = "lg", as: Tag = "h2", className, children, ...rest }: HProps) {
  return (
    <Tag
      style={{ fontVariationSettings: '"opsz" 144, "SOFT" 50' }}
      className={cn(
        "font-display font-medium text-ink leading-[1.1] m-0",
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
