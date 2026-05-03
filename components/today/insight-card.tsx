"use client";

import { useTransition } from "react";
import { Card, Label, Body, Btn } from "@/components/ds";
import { dismissInsight } from "@/app/(app)/today/actions";

interface InsightCardProps {
  id: string;
  body: string;
}

export function InsightCard({ id, body }: InsightCardProps) {
  const [pending, start] = useTransition();
  return (
    <Card accent className="p-5 flex flex-col gap-3">
      <Label accent>hestia spotted</Label>
      <Body size="md" className="text-ink">
        {body}
      </Body>
      <div className="flex gap-2">
        <Btn variant="outline" size="sm">
          Tell me more
        </Btn>
        <Btn
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => start(() => dismissInsight(id))}
        >
          {pending ? "…" : "Dismiss"}
        </Btn>
      </div>
    </Card>
  );
}
