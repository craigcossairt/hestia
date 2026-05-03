"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Check } from "lucide-react";
import { Card, H, Body, Btn, Label, Mono } from "@/components/ds";
import { activateProgram, deactivateProgram } from "@/app/(app)/programs/actions";
import type { Program } from "@/lib/programs";

interface ProgramCardProps {
  program: Program;
  active: boolean;
}

export function ProgramCard({ program, active }: ProgramCardProps) {
  const [pending, start] = useTransition();
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
        <div className="pt-2 flex gap-2">
          {active ? (
            <Btn
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await deactivateProgram();
                })
              }
            >
              {pending ? "Ending…" : "Active · end"}
            </Btn>
          ) : (
            <Btn
              variant="primary"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await activateProgram(program.id);
                })
              }
            >
              {pending ? "Activating…" : "Activate"}
            </Btn>
          )}
          <Link href={`/programs/${program.id}`}>
            <Btn variant="ghost" size="sm">
              Learn more →
            </Btn>
          </Link>
        </div>
      </div>
    </Card>
  );
}
