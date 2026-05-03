"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Card, Label, Body, Btn, Chip, Mono } from "@/components/ds";
import { updateProfile } from "@/app/(app)/me/actions";
import { updateMember } from "@/app/(app)/family/[id]/actions";
import { ALLERGENS, DIET_TAGS } from "@/lib/diet";
import type { EditScope } from "@/components/me/profile-section";

interface DietSectionProps {
  scope?: EditScope;
  initial: {
    dietary_restrictions: string[];
    allergies: string[];
    disliked_foods: string[];
  };
}

export function DietSection({
  initial,
  scope = { kind: "user" },
}: DietSectionProps) {
  const [tags, setTags] = useState<string[]>(initial.dietary_restrictions);
  const [allergies, setAllergies] = useState<string[]>(initial.allergies);
  const [dislikes, setDislikes] = useState<string[]>(initial.disliked_foods);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function toggle(list: string[], setter: (v: string[]) => void, item: string) {
    setter(list.includes(item) ? list.filter((t) => t !== item) : [...list, item]);
  }

  function save() {
    setStatus(null);
    start(async () => {
      const patch = {
        dietary_restrictions: tags,
        allergies,
        disliked_foods: dislikes,
      };
      const result =
        scope.kind === "user"
          ? await updateProfile(patch)
          : await updateMember(scope.memberId, patch);
      setStatus(result?.error ? `Error: ${result.error}` : "Saved.");
    });
  }

  return (
    <Card className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Label accent>diet</Label>
        {status ? (
          <Body
            size="xs"
            className={status.startsWith("Error") ? "text-danger" : "text-success"}
          >
            {status}
          </Body>
        ) : null}
      </div>

      <Subsection
        title="Preferences"
        hint="Lifestyle or pattern (vegetarian, low-carb). Hestia honors when planning."
      >
        <div className="flex flex-wrap gap-2">
          {DIET_TAGS.map((tag) => (
            <Chip
              key={tag}
              variant={tags.includes(tag) ? "fill" : "default"}
              interactive
              onClick={() => toggle(tags, setTags, tag)}
            >
              {tag}
            </Chip>
          ))}
        </div>
      </Subsection>

      <Subsection
        title="Allergies"
        hint="Hard rules — Hestia will never suggest a recipe containing these."
      >
        <div className="flex flex-wrap gap-2">
          {ALLERGENS.map((tag) => (
            <Chip
              key={tag}
              variant={allergies.includes(tag) ? "fill" : "default"}
              interactive
              onClick={() => toggle(allergies, setAllergies, tag)}
            >
              {tag}
            </Chip>
          ))}
        </div>
        <FreeTextChips
          label="Other allergies"
          values={allergies.filter((a) => !ALLERGENS.includes(a))}
          onAdd={(v) =>
            setAllergies((cur) =>
              cur.includes(v) ? cur : [...cur, v.toLowerCase()],
            )
          }
          onRemove={(v) => setAllergies((cur) => cur.filter((x) => x !== v))}
          placeholder="e.g. mustard, mango"
        />
      </Subsection>

      <Subsection
        title="Disliked foods"
        hint="Soft preference — avoided when possible, OK to break for variety."
      >
        <FreeTextChips
          label="Foods to avoid"
          values={dislikes}
          onAdd={(v) =>
            setDislikes((cur) =>
              cur.includes(v) ? cur : [...cur, v.toLowerCase()],
            )
          }
          onRemove={(v) => setDislikes((cur) => cur.filter((x) => x !== v))}
          placeholder="e.g. cilantro, mushrooms"
        />
      </Subsection>

      <div>
        <Btn variant="primary" size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save diet"}
        </Btn>
      </div>
    </Card>
  );
}

function Subsection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-l-2 pl-4 border-ink-l">
      <Mono className="text-ink-3 text-[10.5px] uppercase tracking-[1.4px]">
        {title}
      </Mono>
      <Body size="xs" dim>
        {hint}
      </Body>
      {children}
    </div>
  );
}

function FreeTextChips({
  label,
  values,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2 mt-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
        {label}
      </span>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-tint text-accent font-sans text-[12px]"
            >
              {v}
              <button
                type="button"
                onClick={() => onRemove(v)}
                aria-label={`remove ${v}`}
                className="hover:opacity-70"
              >
                <X size={11} strokeWidth={2.2} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          className="flex-1 px-3 py-1.5 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[13px] outline-none focus:border-accent"
        />
        <Btn variant="outline" size="sm" onClick={commit} type="button">
          Add
        </Btn>
      </div>
    </div>
  );
}
