import { Label } from "./label";
import { Mono } from "./mono";
import { Body } from "./body";
import { cn } from "@/lib/utils";

interface StatProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}

export function Stat({ label, value, sub, className }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      <Mono className="text-ink text-[26px] font-medium leading-none">{value}</Mono>
      {sub ? (
        <Body size="sm" dim>
          {sub}
        </Body>
      ) : null}
    </div>
  );
}
