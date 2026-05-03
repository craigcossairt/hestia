import { cn } from "@/lib/utils";

type BodySize = "lg" | "md" | "sm" | "xs";

const sizeClass: Record<BodySize, string> = {
  lg: "text-[16px]",
  md: "text-[14px]",
  sm: "text-[12.5px]",
  xs: "text-[11px]",
};

interface BodyProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: BodySize;
  dim?: boolean;
  as?: "div" | "p" | "span";
}

export function Body({
  size = "md",
  dim = false,
  as: Tag = "div",
  className,
  children,
  ...rest
}: BodyProps) {
  return (
    <Tag
      className={cn(
        "font-sans leading-[1.5]",
        dim ? "text-ink-3" : "text-ink-2",
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
