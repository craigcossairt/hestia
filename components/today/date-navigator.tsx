"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Label } from "@/components/ds";

interface DateNavigatorProps {
  // YYYY-MM-DD — the date currently shown.
  date: string;
}

const FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const TODAY_STR = () => new Date().toISOString().slice(0, 10);

function shift(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function relativeLabel(date: string): string | null {
  const today = TODAY_STR();
  if (date === today) return "today";
  if (date === shift(today, -1)) return "yesterday";
  if (date === shift(today, 1)) return "tomorrow";
  return null;
}

export function DateNavigator({ date }: DateNavigatorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  function goTo(next: string) {
    const params = new URLSearchParams(search?.toString());
    if (next === TODAY_STR()) params.delete("date");
    else params.set("date", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const rel = relativeLabel(date);
  const dateObj = new Date(`${date}T00:00:00`);
  const formatted = FORMATTER.format(dateObj).toLowerCase();

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => goTo(shift(date, -1))}
        aria-label="Previous day"
        className="w-7 h-7 flex items-center justify-center rounded-thumb text-ink-3 hover:text-ink hover:bg-paper-2 transition-colors"
      >
        <ChevronLeft size={14} strokeWidth={1.6} />
      </button>
      <div ref={pickerRef} className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Pick a date"
          className="flex items-center gap-1.5 px-2 py-1 rounded-thumb hover:bg-paper-2 transition-colors"
        >
          <Calendar size={12} strokeWidth={1.6} className="text-ink-3" />
          <Label>{rel ?? formatted}</Label>
          {rel && rel !== "today" ? (
            <span className="font-mono text-[10px] text-ink-3 normal-case">
              · {formatted}
            </span>
          ) : null}
        </button>
        {pickerOpen ? (
          <div className="absolute z-50 mt-1 left-0 p-3 rounded-thumb border border-ink-l bg-card shadow-[var(--shadow-2)] flex flex-col gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) {
                  goTo(e.target.value);
                  setPickerOpen(false);
                }
              }}
              className="bg-card text-ink font-mono text-[13px] outline-none px-2.5 py-1.5 rounded-thumb border border-ink-l focus:border-accent"
            />
            <button
              type="button"
              onClick={() => {
                goTo(TODAY_STR());
                setPickerOpen(false);
              }}
              className="text-ink-2 hover:text-ink font-sans text-[12.5px] text-left px-2 py-1 rounded-thumb hover:bg-paper-2"
            >
              Jump to today
            </button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => goTo(shift(date, 1))}
        aria-label="Next day"
        className="w-7 h-7 flex items-center justify-center rounded-thumb text-ink-3 hover:text-ink hover:bg-paper-2 transition-colors"
      >
        <ChevronRight size={14} strokeWidth={1.6} />
      </button>
    </div>
  );
}
