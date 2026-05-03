"use client";

import { useState, useTransition } from "react";
import { Card, Label, Body, Btn, Chip } from "@/components/ds";
import { updateProfile } from "@/app/(app)/me/actions";

const DIET_TAGS = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten-free",
  "dairy-free",
  "low-carb",
  "high-protein",
  "no pork",
  "no beef",
  "halal",
  "kosher",
];

export function DietSection({
  initial,
}: {
  initial: string[];
}) {
  const [tags, setTags] = useState<string[]>(initial);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function toggle(tag: string) {
    setTags((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
    );
  }

  function save() {
    setStatus(null);
    start(async () => {
      const result = await updateProfile({ dietary_restrictions: tags });
      setStatus(result?.error ? `Error: ${result.error}` : "Saved.");
    });
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label>diet</Label>
        {status ? (
          <Body size="xs" className={status.startsWith("Error") ? "text-danger" : "text-success"}>
            {status}
          </Body>
        ) : null}
      </div>
      <Body size="sm" dim>
        Hestia uses these when generating recipes and grocery swaps.
      </Body>
      <div className="flex flex-wrap gap-2">
        {DIET_TAGS.map((tag) => (
          <Chip
            key={tag}
            variant={tags.includes(tag) ? "fill" : "default"}
            interactive
            onClick={() => toggle(tag)}
          >
            {tag}
          </Chip>
        ))}
      </div>
      <div>
        <Btn variant="primary" size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save diet"}
        </Btn>
      </div>
    </Card>
  );
}
