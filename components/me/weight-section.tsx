"use client";

import { useState, useTransition } from "react";
import { Card, Label, Body, Btn, Mono } from "@/components/ds";
import { logWeight } from "@/app/(app)/me/actions";
import { logMemberWeight } from "@/app/(app)/family/[id]/actions";
import { kgToLb, lbToKg } from "@/lib/units";
import type { EditScope } from "@/components/me/profile-section";

interface WeightSectionProps {
  scope?: EditScope;
  currentKg: number | null;
  recent: Array<{ id: string; value_kg: number; logged_at: string }>;
}

export function WeightSection({
  currentKg,
  recent,
  scope = { kind: "user" },
}: WeightSectionProps) {
  const currentLb = currentKg ? kgToLb(currentKg) : null;
  const [lb, setLb] = useState<string>(currentLb ? String(currentLb) : "");
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function save() {
    setStatus(null);
    const n = Number(lb);
    if (!n || n < 60 || n > 600) {
      setStatus("Enter a number between 60 and 600 lb.");
      return;
    }
    start(async () => {
      const result =
        scope.kind === "user"
          ? await logWeight(lbToKg(n))
          : await logMemberWeight(scope.memberId, lbToKg(n));
      setStatus(result?.error ? `Error: ${result.error}` : "Logged.");
    });
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label accent>weight</Label>
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
        Log it as often as you want — Stats charts the trend.
      </Body>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={lb}
          onChange={(e) => setLb(e.target.value)}
          placeholder="lb"
          className="w-28 px-3 py-2 rounded-thumb border border-ink-l bg-card text-ink font-mono text-[18px] outline-none focus:border-accent text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="font-mono text-[12px] text-ink-3">lb</span>
        <div className="flex-1" />
        <Btn variant="primary" size="sm" onClick={save} disabled={pending}>
          {pending ? "Logging…" : "Log weight"}
        </Btn>
      </div>
      {recent.length > 0 ? (
        <div className="border-t border-ink-l/40 pt-4 flex flex-col gap-2">
          <Label>recent</Label>
          <ul className="flex flex-col">
            {recent.slice(0, 5).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between py-1.5 border-b border-ink-l/30 last:border-b-0"
              >
                <Mono className="text-ink-2 text-[13px]">{kgToLb(r.value_kg)} lb</Mono>
                <span className="text-ink-3 font-sans text-[11px]">
                  {new Date(r.logged_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
