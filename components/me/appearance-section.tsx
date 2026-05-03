"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, Label, Body, Btn } from "@/components/ds";
import { updateAppearance } from "@/app/(app)/me/actions";
import { cn } from "@/lib/utils";
import type { AccentPreset } from "@/lib/types/database";

const PRESETS: Array<{ id: AccentPreset; swatch: string }> = [
  { id: "charcoal", swatch: "#1a1a1a" },
  { id: "terracotta", swatch: "#b54a25" },
  { id: "forest", swatch: "#3f6212" },
  { id: "ink", swatch: "#1e3a8a" },
];

export function AppearanceSection({
  initialAccent,
  initialDark,
}: {
  initialAccent: AccentPreset;
  initialDark: boolean;
}) {
  const [accent, setAccent] = useState<AccentPreset>(initialAccent);
  const [dark, setDark] = useState<boolean>(initialDark);
  const [pending, start] = useTransition();

  // Apply changes to <html> live so the user sees them immediately.
  useEffect(() => {
    const html = document.documentElement;
    if (accent === "charcoal") html.removeAttribute("data-accent");
    else html.setAttribute("data-accent", accent);
  }, [accent]);

  useEffect(() => {
    const html = document.documentElement;
    if (dark) html.classList.add("dark");
    else html.classList.remove("dark");
  }, [dark]);

  function save() {
    start(async () => {
      await updateAppearance({ accent_preset: accent, dark_mode: dark });
    });
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <Label accent>appearance</Label>

      <div className="flex items-center justify-between">
        <Body size="sm" className="text-ink">
          Theme
        </Body>
        <div className="flex gap-1 p-1 bg-paper-2 rounded-full">
          {[
            { v: false, label: "Light" },
            { v: true, label: "Dark" },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setDark(opt.v)}
              className={cn(
                "px-3 py-1 rounded-full font-sans text-[12px] transition-colors",
                dark === opt.v
                  ? "bg-card text-ink shadow-[var(--shadow-1)]"
                  : "text-ink-3",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Body size="sm" className="text-ink">
          Accent
        </Body>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setAccent(p.id)}
              aria-label={p.id}
              className={cn(
                "w-8 h-8 rounded-full border-2 transition-transform",
                accent === p.id ? "border-ink scale-110" : "border-ink-l hover:scale-105",
              )}
              style={{ background: p.swatch }}
            />
          ))}
        </div>
      </div>

      <div>
        <Btn variant="primary" size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save appearance"}
        </Btn>
      </div>
    </Card>
  );
}
