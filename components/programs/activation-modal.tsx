"use client";

import { useState, useTransition, useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Dialog } from "@/components/ds/dialog";
import { Btn, H, Body, Mono } from "@/components/ds";
import {
  activateProgram,
  type Scope,
} from "@/app/(app)/programs/actions";
import {
  findConflict,
  getProgram,
  type Program,
} from "@/lib/programs";

interface ScopeRow {
  scope: Scope;
  label: string;
  // The active programs already on this scope.
  activePrograms: string[];
}

interface ActivationModalProps {
  open: boolean;
  onClose: () => void;
  program: Program;
  scopes: ScopeRow[];
}

// One-shot picker for activating a pattern/focus program across multiple
// scopes (you + family members). Surfaces conflicts inline so the user sees
// which existing program will be replaced before confirming.
export function ActivationModal({
  open,
  onClose,
  program,
  scopes,
}: ActivationModalProps) {
  // Default-select the user scope only. Family members opt in.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(["user"]));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function scopeKey(s: Scope): string {
    return s.kind === "user" ? "user" : `member:${s.memberId}`;
  }

  const rows = useMemo(
    () =>
      scopes.map((row) => {
        const isAlreadyActive = row.activePrograms.includes(program.id);
        const conflict = isAlreadyActive
          ? null
          : findConflict(program.id, row.activePrograms);
        return { ...row, key: scopeKey(row.scope), isAlreadyActive, conflict };
      }),
    [scopes, program.id],
  );

  const conflictsToReplace = rows
    .filter((r) => selected.has(r.key) && !r.isAlreadyActive && r.conflict)
    .map((r) => ({
      scopeLabel: r.label,
      replacedName: r.conflict!.replacedName,
    }));

  const newActivations = rows.filter(
    (r) => selected.has(r.key) && !r.isAlreadyActive,
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function reset() {
    setSelected(new Set(["user"]));
    setError(null);
  }

  function handleClose() {
    if (pending) return;
    reset();
    onClose();
  }

  function apply() {
    setError(null);
    if (newActivations.length === 0) {
      handleClose();
      return;
    }
    start(async () => {
      for (const row of newActivations) {
        const result = await activateProgram(program.id, row.scope);
        if (result?.error) {
          setError(`Couldn't apply to ${row.label}: ${result.error}`);
          return;
        }
      }
      reset();
      onClose();
    });
  }

  const applyLabel = pending
    ? "Applying…"
    : newActivations.length === 0
      ? "Done"
      : conflictsToReplace.length > 0
        ? `Override and activate (${newActivations.length})`
        : `Activate (${newActivations.length})`;

  return (
    <Dialog open={open} onClose={handleClose} size="md">
      <div className="flex flex-col gap-5 p-6">
        <header className="flex flex-col gap-1.5">
          <Mono className="text-ink-3 text-[10.5px] uppercase tracking-[1.4px]">
            Activate program
          </Mono>
          <H size="md" as="h2">
            {program.name}
          </H>
          <Body size="sm" dim>
            {program.short}
          </Body>
        </header>

        <div className="flex flex-col gap-2.5">
          <Mono className="text-ink-3 text-[10.5px] uppercase tracking-[1.4px]">
            Apply to
          </Mono>
          <ul className="flex flex-col gap-2">
            {rows.map((row) => {
              const checked = selected.has(row.key);
              const disabled = row.isAlreadyActive;
              return (
                <li key={row.key}>
                  <label
                    className={`flex items-start gap-3 p-3 rounded-card border transition-colors ${
                      disabled
                        ? "border-ink-l/40 bg-paper-2 cursor-not-allowed"
                        : checked
                          ? "border-accent bg-accent-tint cursor-pointer"
                          : "border-ink-l hover:border-ink-3 cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
                      checked={disabled || checked}
                      disabled={disabled || pending}
                      onChange={() => toggle(row.key)}
                    />
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <span className="font-sans text-[14px] text-ink font-medium">
                          {row.label}
                        </span>
                        {disabled ? (
                          <span className="inline-flex items-center gap-1 text-ink-3 font-sans text-[11.5px]">
                            <Check size={12} strokeWidth={2.5} className="text-accent" />
                            Already active
                          </span>
                        ) : null}
                      </div>
                      {row.conflict && checked && !disabled ? (
                        <div className="flex items-start gap-1.5 text-warn font-sans text-[12px]">
                          <AlertTriangle size={12} strokeWidth={2} className="mt-0.5 shrink-0" />
                          <span>
                            Replaces{" "}
                            <strong className="font-medium">
                              {row.conflict.replacedName}
                            </strong>{" "}
                            on this person.
                          </span>
                        </div>
                      ) : row.conflict && !disabled ? (
                        <span className="text-ink-3 font-sans text-[12px]">
                          Currently on{" "}
                          <strong className="font-medium text-ink-2">
                            {row.conflict.replacedName}
                          </strong>
                          {" "}— check to replace.
                        </span>
                      ) : !disabled && row.activePrograms.length > 0 ? (
                        <span className="text-ink-3 font-sans text-[12px]">
                          Stacks with: {row.activePrograms
                            .map((id) => getProgram(id)?.name)
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      ) : null}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        {error ? (
          <Body size="sm" className="text-danger">
            {error}
          </Body>
        ) : null}

        <div className="flex justify-end gap-2 pt-2 border-t border-ink-l/40">
          <Btn variant="ghost" onClick={handleClose} disabled={pending}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={apply} disabled={pending}>
            {applyLabel}
          </Btn>
        </div>
      </div>
    </Dialog>
  );
}
