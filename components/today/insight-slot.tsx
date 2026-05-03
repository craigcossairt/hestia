"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Card, Label, Body, Btn } from "@/components/ds";
import { InsightCard } from "./insight-card";

interface InsightSlotProps {
  insight: { id: string; body: string } | null;
  hoursOld: number | null;
}

export function InsightSlot({ insight, hoursOld }: InsightSlotProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Active insight rendered; offer a refresh if it's >24h old.
  if (insight) {
    return (
      <div className="flex flex-col gap-2">
        <InsightCard id={insight.id} body={insight.body} />
        {hoursOld != null && hoursOld > 24 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => askForOne(start, setError, router)}
            className="self-start text-ink-3 hover:text-ink font-mono text-[11px] uppercase tracking-wider px-2 py-1"
          >
            {pending ? "Thinking…" : "Ask for a fresh one →"}
          </button>
        ) : null}
        {error ? <Body size="xs" className="text-danger">{error}</Body> : null}
      </div>
    );
  }

  // No active insight — show a CTA.
  return (
    <Card className="p-5 flex flex-col gap-3 border-dashed">
      <Label>hestia spotted</Label>
      <Body size="sm" dim>
        Want a quick observation about today?
      </Body>
      <div>
        <Btn
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => askForOne(start, setError, router)}
        >
          <Sparkles size={14} strokeWidth={1.5} />{" "}
          {pending ? "Asking Hestia…" : "Ask Hestia"}
        </Btn>
      </div>
      {error ? <Body size="sm" className="text-danger">{error}</Body> : null}
    </Card>
  );
}

function askForOne(
  start: (cb: () => void) => void,
  setError: (s: string | null) => void,
  router: ReturnType<typeof useRouter>,
) {
  setError(null);
  start(async () => {
    try {
      const res = await fetch("/api/ai/insights/generate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  });
}
