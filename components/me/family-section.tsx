"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Card, Label, Body, Btn, Mono, Chip } from "@/components/ds";
import { updateFamily } from "@/app/(app)/me/actions";
import { newFamilyMember, type FamilyMember } from "@/lib/family";
import { cn } from "@/lib/utils";

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
  "picky eater",
  "nut allergy",
];

export function FamilySection({ initial }: { initial: FamilyMember[] }) {
  const [members, setMembers] = useState<FamilyMember[]>(initial);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function update(id: string, patch: Partial<FamilyMember>) {
    setMembers((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function remove(id: string) {
    setMembers((cur) => cur.filter((m) => m.id !== id));
  }

  function add() {
    setMembers((cur) => [...cur, newFamilyMember()]);
  }

  function save() {
    setStatus(null);
    const cleaned = members
      .map((m) => ({ ...m, name: m.name.trim() }))
      .filter((m) => m.name.length > 0);
    start(async () => {
      const result = await updateFamily(cleaned);
      setStatus(result?.error ? `Error: ${result.error}` : "Saved.");
      if (!result?.error) setMembers(cleaned);
    });
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label>family</Label>
        {status ? (
          <Body
            size="xs"
            className={status.startsWith("Error") ? "text-danger" : "text-success"}
          >
            {status}
          </Body>
        ) : null}
      </div>
      <Body size="sm" dim>
        Anyone you cook for. Hestia uses this to suggest portion sizes,
        decompose recipes for picky eaters, and check allergens.
      </Body>

      {members.length === 0 ? (
        <div className="rounded-thumb border border-dashed border-ink-l p-6 text-center">
          <Body size="sm" dim>
            No family members yet.
          </Body>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              onUpdate={(patch) => update(m.id, patch)}
              onRemove={() => remove(m.id)}
            />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Btn variant="outline" size="sm" onClick={add}>
          + Add member
        </Btn>
        <Btn variant="primary" size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save family"}
        </Btn>
      </div>
    </Card>
  );
}

function MemberRow({
  member,
  onUpdate,
  onRemove,
}: {
  member: FamilyMember;
  onUpdate: (patch: Partial<FamilyMember>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-card border border-ink-l bg-paper-2/40 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={member.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Name"
          className="flex-1 px-3 py-1.5 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[14px] outline-none focus:border-accent"
        />
        <input
          type="number"
          value={member.age}
          onChange={(e) => onUpdate({ age: Number(e.target.value) || 0 })}
          inputMode="numeric"
          min={0}
          max={120}
          className="w-16 px-2 py-1.5 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[14px] outline-none focus:border-accent text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <Mono className="text-ink-3 text-[10px]">yrs</Mono>
        <select
          value={member.sex ?? ""}
          onChange={(e) =>
            onUpdate({
              sex: (e.target.value || undefined) as FamilyMember["sex"],
            })
          }
          className="px-2 py-1.5 rounded-thumb border border-ink-l bg-card text-ink-2 font-sans text-[12px] outline-none focus:border-accent capitalize"
        >
          <option value="">—</option>
          <option value="male">male</option>
          <option value="female">female</option>
          <option value="other">other</option>
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-ink-3 hover:text-danger transition-colors"
          aria-label="remove"
        >
          <Trash2 size={14} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[1.4px] text-ink-3">
          portion
        </span>
        <div className="flex gap-1">
          {[
            { v: 0.5, label: "0.5×" },
            { v: 0.75, label: "0.75×" },
            { v: 1, label: "1×" },
            { v: 1.25, label: "1.25×" },
            { v: 1.5, label: "1.5×" },
          ].map((opt) => {
            const cur = member.portion_modifier ?? 1;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => onUpdate({ portion_modifier: opt.v })}
                className={cn(
                  "px-2.5 py-1 rounded-full font-mono text-[11px] border transition-colors",
                  cur === opt.v
                    ? "bg-ink text-paper border-ink"
                    : "border-ink-l text-ink-2 hover:bg-paper-2",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {DIET_TAGS.map((t) => {
          const on = member.dietary_restrictions.includes(t);
          return (
            <Chip
              key={t}
              variant={on ? "fill" : "default"}
              interactive
              onClick={() =>
                onUpdate({
                  dietary_restrictions: on
                    ? member.dietary_restrictions.filter((x) => x !== t)
                    : [...member.dietary_restrictions, t],
                })
              }
            >
              {t}
            </Chip>
          );
        })}
      </div>

      <input
        value={member.notes ?? ""}
        onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
        placeholder="Notes (e.g. 'soccer practice Tues/Thurs', 'loves spicy')"
        className="px-3 py-1.5 rounded-thumb border border-ink-l bg-card text-ink-2 font-sans text-[13px] outline-none focus:border-accent"
      />
    </div>
  );
}
