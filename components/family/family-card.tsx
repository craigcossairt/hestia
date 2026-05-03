import { Card, Label, H, Body, Mono, Chip } from "@/components/ds";
import type { FamilyMember } from "@/lib/family";
import { getProgram } from "@/lib/programs";

export function FamilyCard({ member }: { member: FamilyMember }) {
  const portion = member.portion_modifier ?? 1;
  const programs = (member.active_programs ?? [])
    .map((id) => getProgram(id))
    .filter((p): p is NonNullable<ReturnType<typeof getProgram>> => !!p);
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <Label>
          {member.sex ?? "person"} · {member.age} yrs
        </Label>
        <Mono className="text-ink-3 text-[11px]">portion {portion}×</Mono>
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
      {programs.length > 0 ? (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-ink-l/40">
          <Mono className="text-ink-3 text-[10px] uppercase tracking-wider">
            Active programs
          </Mono>
          <div className="flex flex-wrap items-center gap-1.5">
            {programs.map((p) => (
              <span
                key={p.id}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent-tint text-accent font-sans text-[11px]"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: p.hero_color }}
                />
                {p.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
