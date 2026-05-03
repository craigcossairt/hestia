import Link from "next/link";
import { Card, FoodImage, Label, H, Mono, Chip } from "@/components/ds";

interface MealCardProps {
  slot: string;
  time?: string;
  name: string;
  kcal?: number | null;
  protein?: number | null;
  status?: "planned" | "logged" | "skipped";
  href?: string;
  photoUrl?: string | null;
}

export function MealCard({
  slot,
  time,
  name,
  kcal,
  protein,
  status,
  href,
  photoUrl,
}: MealCardProps) {
  const Inner = (
    <Card interactive={!!href} className="overflow-hidden flex flex-col">
      <FoodImage name={name} src={photoUrl ?? undefined} height={140} rounded={false} showLabel={false} />
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>
            {slot}
            {time ? ` · ${time}` : ""}
          </Label>
          {status ? (
            <Chip variant={status === "logged" ? "success" : status === "skipped" ? "dim" : "default"}>
              {status}
            </Chip>
          ) : null}
        </div>
        <H size="sm">{name}</H>
        {kcal != null || protein != null ? (
          <Mono className="text-ink-2 text-[12.5px]">
            {kcal != null ? `${kcal} kcal` : null}
            {kcal != null && protein != null ? " · " : null}
            {protein != null ? `${protein} g protein` : null}
          </Mono>
        ) : null}
      </div>
    </Card>
  );
  return href ? <Link href={href}>{Inner}</Link> : Inner;
}

export function EmptyMealCard({ slot, time }: { slot: string; time?: string }) {
  return (
    <Card className="p-4 flex flex-col gap-2 border-dashed bg-paper-2/40">
      <Label>
        {slot}
        {time ? ` · ${time}` : ""}
      </Label>
      <div className="text-ink-3 font-display text-[18px] italic">
        nothing planned
      </div>
      <Mono className="text-ink-3 text-[11px]">+ add meal</Mono>
    </Card>
  );
}
