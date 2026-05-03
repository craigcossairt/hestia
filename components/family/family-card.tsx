import { Card, Label, H, Body, Mono, Chip } from "@/components/ds";
import type { FamilyMember } from "@/lib/family";

export function FamilyCard({ member }: { member: FamilyMember }) {
  const portion = member.portion_modifier ?? 1;
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <Label>
          {member.sex ?? "person"} · {member.age} yrs
        </Label>
        <Mono className="text-ink-3 text-[11px]">
          portion {portion}×
        </Mono>
      </div>
      <H size="md" as="h3">
        {member.name}
      </H>
      {member.dietary_restrictions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {member.dietary_restrictions.map((d) => (
            <Chip key={d} variant="dim">
              {d}
            </Chip>
          ))}
        </div>
      ) : (
        <Body size="sm" dim>
          No dietary restrictions.
        </Body>
      )}
      {member.notes ? (
        <Body size="sm" className="text-ink-2 italic">
          {member.notes}
        </Body>
      ) : null}
    </Card>
  );
}
