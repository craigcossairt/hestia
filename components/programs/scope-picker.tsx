"use client";

import { useState, useTransition } from "react";
import { Body, Mono } from "@/components/ds";
import {
  activateProgram,
  deactivateProgram,
  type Scope,
} from "@/app/(app)/programs/actions";
import { cn } from "@/lib/utils";
import { assignableToMembers, type ProgramKind } from "@/lib/programs";

interface ScopeOption {
  label: string;
  scope: Scope;
  active: boolean;
}

interface ScopePickerProps {
  programId: string;
  programName: string;
  programKind: ProgramKind;
  options: ScopeOption[];
}

export function ScopePicker({
  programId,
  programName,
  programKind,
  options,
}: ScopePickerProps) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const memberAssignable = assignableToMembers(programKind);

  function toggle(opt: ScopeOption) {
    setStatus(null);
    start(async () => {
      const result = opt.active
        ? await deactivateProgram(programId, opt.scope)
        : await activateProgram(programId, opt.scope);
      if (result?.error) {
        setStatus(`Error: ${result.error}`);
      } else if (result?.replaced) {
        setStatus(
          `Replaced ${result.replaced.name} on ${opt.label}.`,
        );
      } else if (!opt.active) {
        setStatus(`Activated for ${opt.label}.`);
      } else {
        setStatus(`Ended for ${opt.label}.`);
      }
    });
  }

  const visibleOptions = memberAssignable
    ? options
    : options.filter((o) => o.scope.kind === "user");

  return (
    <div className="flex flex-col gap-3">
      <Mono className="text-ink-3 text-[10px] uppercase tracking-wider">
        Active for
      </Mono>
      <div className="flex flex-wrap gap-2">
        {visibleOptions.map((opt) => (
          <button
            key={opt.label}
            type="button"
            disabled={pending}
            onClick={() => toggle(opt)}
            className={cn(
              "px-3 py-1.5 rounded-full font-sans text-[12.5px] border transition-colors",
              opt.active
                ? "bg-accent text-paper border-accent"
                : "bg-transparent text-ink-2 border-ink-l hover:border-ink-3 hover:bg-paper-2",
            )}
          >
            {opt.active ? "✓ " : ""}
            {opt.label}
          </button>
        ))}
      </div>
      {!memberAssignable ? (
        <Body size="xs" dim>
          {programName} is a household program — assigned to you only.
        </Body>
      ) : null}
      {status ? (
        <Body
          size="xs"
          className={status.startsWith("Error") ? "text-danger" : "text-ink-3"}
        >
          {status}
        </Body>
      ) : null}
    </div>
  );
}
