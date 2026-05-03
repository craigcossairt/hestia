"use client";

import { useState, useTransition } from "react";
import { Card, Label, Body, Btn } from "@/components/ds";
import { updateProfile } from "@/app/(app)/me/actions";

interface Schedule {
  breakfast: string;
  lunch: string;
  dinner: string;
}

export function ScheduleSection({ initial }: { initial: Schedule }) {
  const [schedule, setSchedule] = useState<Schedule>({
    breakfast: initial.breakfast ?? "08:00",
    lunch: initial.lunch ?? "12:30",
    dinner: initial.dinner ?? "19:00",
  });
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function save() {
    setStatus(null);
    start(async () => {
      const result = await updateProfile({ schedule });
      setStatus(result?.error ? `Error: ${result.error}` : "Saved.");
    });
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label>schedule</Label>
        {status ? (
          <Body size="xs" className={status.startsWith("Error") ? "text-danger" : "text-success"}>
            {status}
          </Body>
        ) : null}
      </div>
      <Body size="sm" dim>
        Default times shown on your Today page.
      </Body>
      {(["breakfast", "lunch", "dinner"] as const).map((slot) => (
        <label
          key={slot}
          className="flex items-center justify-between px-3 py-2 -mx-1 rounded-thumb hover:bg-paper-2 transition-colors"
        >
          <span className="font-mono text-[10.5px] uppercase tracking-[1.4px] text-ink-3">
            {slot}
          </span>
          <input
            type="time"
            value={schedule[slot]}
            onChange={(e) =>
              setSchedule((s) => ({ ...s, [slot]: e.target.value }))
            }
            className="bg-transparent text-ink font-mono text-[16px] outline-none w-28 text-right"
          />
        </label>
      ))}
      <div>
        <Btn variant="primary" size="sm" onClick={save} disabled={pending}>
          {pending ? "saving…" : "save schedule"}
        </Btn>
      </div>
    </Card>
  );
}
