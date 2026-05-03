import Link from "next/link";
import { Card, Label, H, Body, Mono, Chip } from "@/components/ds";
import type { FamilyMember } from "@/lib/family";
import { getProgram } from "@/lib/programs";

interface FamilyCardProps {
  // The member's data (works for self too — pass the user's profile shaped
  // as a FamilyMember).
  member: FamilyMember;
  // Where the card's name should link.
  href: string;
  // Show "you" framing for the account holder's card.
  isSelf?: boolean;
}

export function FamilyCard({ member, href, isSelf }: FamilyCardProps) {
  const portion = member.portion_modifier ?? 1;
  const programs = (member.active_programs ?? [])
    .map((id) => getProgram(id))
    .filter((p): p is NonNullable<ReturnType<typeof getProgram>> => !!p);
  const allergyCount = (member.allergies ?? []).length;
  const conditionCount = (member.medical_conditions ?? []).length;

  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <Label>
          {isSelf
            ? "you"
            : `${member.sex ?? "person"} · ${member.age} yrs`}
        </Label>
        <Mono className="text-ink-3 text-[11px]">portion {portion}×</Mono>
      </div>
      <Link
        href={href}
        className="group inline-flex items-baseline gap-2 hover:opacity-80 transition-opacity"
      >
        <H size="md" as="h3" className="group-hover:underline">
          {member.name || "Unnamed"}
        </H>
        <Mono className="text-ink-3 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity">
          edit →
        </Mono>
      </Link>
      {!isSelf ? (
        <Mono className="text-ink-3 text-[11px] -mt-1">{member.age} yrs</Mono>
      ) : null}
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
      {allergyCount > 0 || conditionCount > 0 ? (
        <div className="flex flex-wrap gap-3 text-ink-3 font-sans text-[11.5px]">
          {allergyCount > 0 ? (
            <span>
              <span className="text-warn font-medium">{allergyCount}</span>{" "}
              {allergyCount === 1 ? "allergy" : "allergies"}
            </span>
          ) : null}
          {conditionCount > 0 ? (
            <span>
              <span className="text-ink font-medium">{conditionCount}</span>{" "}
              medical
            </span>
          ) : null}
        </div>
      ) : null}
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
