import { Lightbulb } from "lucide-react";
import { Card, Label, Body } from "@/components/ds";

interface TipsListProps {
  tips: string[];
}

// Optional list of expert-level cooking pointers attached to a recipe —
// little things that improve the dish but aren't mandatory steps.
// Rendered alongside ingredients + steps when at least one tip exists.
export function TipsList({ tips }: TipsListProps) {
  if (!tips?.length) return null;
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Lightbulb size={14} strokeWidth={1.5} className="text-accent" />
        <Label accent>tips</Label>
      </div>
      <Body size="sm" dim>
        Optional pointers that make the dish better.
      </Body>
      <ul className="flex flex-col gap-2 mt-1">
        {tips.map((tip, i) => (
          <li
            key={i}
            className="flex items-start gap-2.5 px-3 py-2 rounded-thumb bg-paper-2/50"
          >
            <span className="font-mono text-[11px] text-ink-3 mt-0.5 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <Body size="sm" className="text-ink-2 flex-1">
              {tip}
            </Body>
          </li>
        ))}
      </ul>
    </Card>
  );
}
