"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Btn, Body } from "@/components/ds";

export function GenerateWeekButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function generate() {
    setStatus(null);
    start(async () => {
      try {
        const res = await fetch("/api/ai/plan-week", { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed");
        const created = json.created?.length ?? 0;
        const skipped = json.skipped ?? 0;
        setStatus(
          `Added ${created} dinner${created === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} (already planned)` : ""}.`,
        );
        router.refresh();
      } catch (err) {
        setStatus(`Error: ${(err as Error).message}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Btn variant="primary" onClick={generate} disabled={pending}>
        <Sparkles size={14} strokeWidth={1.5} />
        {pending ? "thinking…" : "generate this week's dinners"}
      </Btn>
      {status ? (
        <Body
          size="sm"
          className={status.startsWith("Error") ? "text-danger" : "text-ink-3"}
        >
          {status}
        </Body>
      ) : null}
    </div>
  );
}
