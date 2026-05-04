"use client";

import { useState, useTransition } from "react";
import { Card, Label, Body } from "@/components/ds";
import { updateCookingPrefs } from "@/app/(app)/me/actions";

interface CookingSectionProps {
  initialAutoDecrement: boolean;
}

export function CookingSection({ initialAutoDecrement }: CookingSectionProps) {
  const [autoDecrement, setAutoDecrement] = useState(initialAutoDecrement);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function toggle(next: boolean) {
    setAutoDecrement(next);
    setStatus(null);
    start(async () => {
      const result = await updateCookingPrefs({ auto_decrement_pantry: next });
      if (result?.error) {
        setStatus(`Error: ${result.error}`);
        setAutoDecrement(!next);
      } else {
        setStatus("Saved.");
      }
    });
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label accent>cooking</Label>
        {status ? (
          <Body
            size="xs"
            className={status.startsWith("Error") ? "text-danger" : "text-success"}
          >
            {status}
          </Body>
        ) : null}
      </div>

      <label className="flex items-start justify-between gap-4 cursor-pointer">
        <div className="flex flex-col gap-1 min-w-0">
          <Body size="sm" className="text-ink">
            Auto-decrement inventory after cooking
          </Body>
          <Body size="xs" dim>
            When you mark a recipe as eaten, Hestia subtracts matching
            ingredients from your inventory. Skipped if a unit doesn&apos;t
            match (you&apos;ll see those on the shopping list).
          </Body>
        </div>
        <ToggleSwitch
          checked={autoDecrement}
          onChange={toggle}
          disabled={pending}
        />
      </label>
    </Card>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`mt-0.5 relative shrink-0 w-10 h-6 rounded-full border-2 transition-colors disabled:opacity-50 ${
        checked
          ? "bg-accent border-accent"
          : "bg-ink-l/50 border-ink-3 hover:bg-ink-l"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow-[var(--shadow-1)] transition-transform ${
          checked ? "bg-card translate-x-4" : "bg-paper translate-x-0"
        }`}
      />
    </button>
  );
}
