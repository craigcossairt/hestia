"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { X, AlertTriangle } from "lucide-react";
import { Card, Label, Body, Btn, Chip, Mono } from "@/components/ds";
import { updateProfile } from "@/app/(app)/me/actions";
import { updateMember } from "@/app/(app)/family/[id]/actions";
import { MEDICAL_CONDITIONS } from "@/lib/diet";
import type { EditScope } from "@/components/me/profile-section";

interface HealthSectionProps {
  scope?: EditScope;
  initial: string[];
}

export function HealthSection({
  initial,
  scope = { kind: "user" },
}: HealthSectionProps) {
  const [conditions, setConditions] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function toggle(item: string) {
    setConditions((cur) =>
      cur.includes(item) ? cur.filter((t) => t !== item) : [...cur, item],
    );
  }

  function addCustom() {
    const trimmed = draft.trim().toLowerCase();
    if (!trimmed) return;
    setConditions((cur) => (cur.includes(trimmed) ? cur : [...cur, trimmed]));
    setDraft("");
  }

  function save() {
    setStatus(null);
    start(async () => {
      const result =
        scope.kind === "user"
          ? await updateProfile({ medical_conditions: conditions })
          : await updateMember(scope.memberId, {
              medical_conditions: conditions,
            });
      setStatus(result?.error ? `Error: ${result.error}` : "Saved.");
    });
  }

  const customConditions = conditions.filter(
    (c) => !MEDICAL_CONDITIONS.includes(c),
  );

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label accent>health</Label>
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
        Chronic conditions Hestia should factor into recipes, plans, and
        coaching. Stored privately on your profile.{" "}
        <span className="text-ink-2">Hestia is not a clinician — always
        confirm changes with your care team.</span>
      </Body>

      <div className="flex flex-wrap gap-2">
        {MEDICAL_CONDITIONS.map((c) => (
          <Chip
            key={c}
            variant={conditions.includes(c) ? "fill" : "default"}
            interactive
            onClick={() => toggle(c)}
          >
            {c}
          </Chip>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-ink-l/40 pt-4">
        <Mono className="text-ink-3 text-[10px] uppercase tracking-wider">
          Other conditions
        </Mono>
        {customConditions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {customConditions.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-tint text-accent font-sans text-[12px]"
              >
                {c}
                <button
                  type="button"
                  onClick={() => toggle(c)}
                  aria-label={`remove ${c}`}
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
                addCustom();
              }
            }}
            placeholder="e.g. gout, gestational diabetes"
            className="flex-1 px-3 py-1.5 rounded-thumb border border-ink-l bg-card text-ink font-sans text-[13px] outline-none focus:border-accent"
          />
          <Btn variant="outline" size="sm" onClick={addCustom} type="button">
            Add
          </Btn>
        </div>
      </div>

      {conditions.length > 0 ? (
        <div className="flex items-start gap-2 p-3 rounded-thumb bg-accent-tint border border-accent/30">
          <AlertTriangle
            size={14}
            strokeWidth={2}
            className="text-accent mt-0.5 shrink-0"
          />
          <Body size="xs" className="text-ink-2">
            Consider activating the{" "}
            <Link
              href="/programs/therapeutic"
              className="text-accent underline underline-offset-2"
            >
              Therapeutic program
            </Link>{" "}
            for lab-aware planning around your condition.
          </Body>
        </div>
      ) : null}

      <div>
        <Btn variant="primary" size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save health"}
        </Btn>
      </div>
    </Card>
  );
}
