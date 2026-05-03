"use client";

import { useEffect, useState, useTransition } from "react";
import { Sun, Moon } from "lucide-react";
import { updateAppearance } from "@/app/(app)/me/actions";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  initialDark: boolean;
  collapsed?: boolean;
}

export function ThemeToggle({ initialDark, collapsed }: ThemeToggleProps) {
  const [dark, setDark] = useState(initialDark);
  const [, start] = useTransition();

  useEffect(() => {
    const html = document.documentElement;
    if (dark) html.classList.add("dark");
    else html.classList.remove("dark");
  }, [dark]);

  function toggle() {
    const next = !dark;
    setDark(next);
    start(async () => {
      await updateAppearance({ dark_mode: next });
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Switch to light" : "Switch to dark"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "flex items-center justify-center rounded-thumb text-ink-3 hover:text-ink hover:bg-paper-3 transition-colors",
        collapsed ? "w-9 h-9" : "w-9 h-9",
      )}
    >
      {dark ? (
        <Sun size={16} strokeWidth={1.5} />
      ) : (
        <Moon size={16} strokeWidth={1.5} />
      )}
    </button>
  );
}
