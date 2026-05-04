import { Users } from "lucide-react";
import { Card, Label, Body } from "@/components/ds";

export interface FamilyNote {
  member_name: string;
  notes: string;
}

interface FamilyNotesProps {
  notes: FamilyNote[];
}

// Per-family-member adaptations attached to a recipe (allergy substitution,
// portion bump, picky-eater swap, etc). Rendered as a labelled list on
// the recipe detail page when at least one note exists.
export function FamilyNotes({ notes }: FamilyNotesProps) {
  if (!notes?.length) return null;
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Users size={14} strokeWidth={1.5} className="text-accent" />
        <Label accent>family modifications</Label>
      </div>
      <Body size="sm" dim>
        How each plate differs from the base recipe.
      </Body>
      <ul className="flex flex-col gap-2.5 mt-1">
        {notes.map((n, i) => (
          <li
            key={`${n.member_name}-${i}`}
            className="flex items-baseline gap-3 px-3 py-2 rounded-thumb bg-paper-2/50"
          >
            <span className="font-sans text-[13px] text-ink font-medium shrink-0 min-w-[6rem]">
              {n.member_name}
            </span>
            <span className="font-sans text-[13px] text-ink-2 flex-1">
              {n.notes}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
