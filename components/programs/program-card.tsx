"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Card, H, Body, Btn, Label, Mono } from "@/components/ds";
import {
  activateProgram,
  deactivateProgram,
} from "@/app/(app)/programs/actions";
import { ActivationModal } from "@/components/programs/activation-modal";
import type { Program } from "@/lib/programs";
import { assignableToMembers } from "@/lib/programs";
import type { Scope } from "@/app/(app)/programs/actions";

interface FamilyScope {
  id: string;
  name: string;
  active_programs: string[];
}

interface ProgramCardProps {
  program: Program;
  // The scopes this program is currently active on. Empty array = inactive.
  // Each entry is "you" or a family member's display name.
  activeScopes: string[];
  // Whether the user is on this program (controls primary toggle text).
  activeForUser: boolean;
  // Used to drive the activation modal: if pattern/focus + family present,
  // we ask which scopes to apply to.
  userActivePrograms: string[];
  family: FamilyScope[];
}

export function ProgramCard({
  program,
  activeScopes,
  activeForUser,
  userActivePrograms,
  family,
}: ProgramCardProps) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const memberAssignable = assignableToMembers(program.kind);
  const showModalFlow = memberAssignable && family.length > 0;

  function handleClick() {
    setStatus(null);
    if (activeForUser) {
      // Active for user → end on user. Member-scope toggling lives on the
      // detail page so this stays a single-action button.
      start(async () => {
        const result = await deactivateProgram(program.id, { kind: "user" });
        if (result?.error) setStatus(`Error: ${result.error}`);
        else setStatus("Ended for you.");
      });
      return;
    }
    if (showModalFlow) {
      setModalOpen(true);
      return;
    }
    // Workflow program OR pattern/focus with no family → simple activate.
    start(async () => {
      const result = await activateProgram(program.id, { kind: "user" });
      if (result?.error) setStatus(`Error: ${result.error}`);
      else if (result?.replaced) setStatus(`Replaced ${result.replaced.name}.`);
    });
  }

  // Build the scopes the modal will ask about. "You" + each named member.
  const modalScopes: Array<{
    scope: Scope;
    label: string;
    activePrograms: string[];
  }> = [
    {
      scope: { kind: "user" },
      label: "You",
      activePrograms: userActivePrograms,
    },
    ...family.map((m) => ({
      scope: { kind: "member" as const, memberId: m.id },
      label: m.name,
      activePrograms: m.active_programs,
    })),
  ];

  return (
    <Card className="overflow-hidden flex flex-col">
      <div
        className="h-20"
        style={{
          background: `linear-gradient(135deg, ${program.hero_color}, color-mix(in oklch, ${program.hero_color} 70%, white))`,
        }}
      />
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between">
          <Label>{program.category}</Label>
          <Mono className="text-ink-3 text-[11px]">{program.duration_days}d</Mono>
        </div>
        <Link href={`/programs/${program.id}`}>
          <H size="md" as="h3" className="hover:underline">
            {program.name}
          </H>
        </Link>
        <Body size="sm" dim className="flex-1">
          {program.short}
        </Body>
        <ul className="flex flex-col gap-1 mt-1">
          {program.features.slice(0, 3).map((f) => (
            <li
              key={f}
              className="flex items-start gap-2 text-ink-2 font-sans text-[12.5px]"
            >
              <Check size={12} strokeWidth={2} className="mt-1 shrink-0 text-accent" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        {activeScopes.length > 0 ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Mono className="text-ink-3 text-[10px] uppercase tracking-wider">
              Active for
            </Mono>
            {activeScopes.map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 rounded-full bg-accent-tint text-accent font-sans text-[11px]"
              >
                {s}
              </span>
            ))}
          </div>
        ) : null}
        <div className="pt-2 flex flex-wrap gap-2">
          <Btn
            variant={activeForUser ? "outline" : "primary"}
            size="sm"
            disabled={pending}
            onClick={handleClick}
          >
            {pending
              ? "…"
              : activeForUser
                ? "Active · end"
                : showModalFlow
                  ? "Activate…"
                  : "Activate"}
          </Btn>
          <Link href={`/programs/${program.id}`}>
            <Btn variant="ghost" size="sm">
              {memberAssignable ? "Manage scopes →" : "Learn more →"}
            </Btn>
          </Link>
        </div>
        {status ? (
          <Body
            size="xs"
            className={status.startsWith("Error") ? "text-danger" : "text-ink-3"}
          >
            {status}
          </Body>
        ) : null}
      </div>
      {showModalFlow ? (
        <ActivationModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          program={program}
          scopes={modalScopes}
        />
      ) : null}
    </Card>
  );
}
