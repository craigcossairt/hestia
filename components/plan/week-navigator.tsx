"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Mono } from "@/components/ds";

interface WeekNavigatorProps {
  // YYYY-MM-DD of the Monday that starts the week being viewed.
  weekStart: string;
}

const RANGE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function shiftDays(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function snapToMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0=Sun, 1=Mon, …
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function thisMonday(): string {
  return snapToMonday(new Date().toISOString().slice(0, 10));
}

export function WeekNavigator({ weekStart }: WeekNavigatorProps) {
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

  function goToWeek(monday: string) {
    const params = new URLSearchParams(search?.toString());
    if (monday === thisMonday()) params.delete("week");
    else params.set("week", monday);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const isCurrent = weekStart === thisMonday();
  const range = `${RANGE_FMT.format(start)} – ${RANGE_FMT.format(end)}`;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => goToWeek(shiftDays(weekStart, -7))}
        aria-label="Previous week"
        className="w-7 h-7 flex items-center justify-center rounded-thumb text-ink-3 hover:text-ink hover:bg-paper-2 transition-colors"
      >
        <ChevronLeft size={14} strokeWidth={1.6} />
      </button>
      <div ref={pickerRef} className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Pick a week"
          className="flex items-center gap-1.5 px-2 py-1 rounded-thumb hover:bg-paper-2 transition-colors"
        >
          <Calendar size={12} strokeWidth={1.6} className="text-ink-3" />
          <span className="font-mono text-[10.5px] uppercase tracking-[1.4px] text-ink-3">
            {isCurrent ? "this week" : "week of"}
          </span>
          <Mono className="text-ink text-[12px] normal-case">{range}</Mono>
        </button>
        {pickerOpen ? (
          <div className="absolute z-50 mt-1 right-0 p-3 rounded-thumb border border-ink-l bg-card shadow-[var(--shadow-2)] flex flex-col gap-2">
            <input
              type="date"
              value={weekStart}
              onChange={(e) => {
                if (e.target.value) {
                  goToWeek(snapToMonday(e.target.value));
                  setPickerOpen(false);
                }
              }}
              className="bg-card text-ink font-mono text-[13px] outline-none px-2.5 py-1.5 rounded-thumb border border-ink-l focus:border-accent"
            />
            <button
              type="button"
              onClick={() => {
                goToWeek(thisMonday());
                setPickerOpen(false);
              }}
              className="text-ink-2 hover:text-ink font-sans text-[12.5px] text-left px-2 py-1 rounded-thumb hover:bg-paper-2"
            >
              Jump to this week
            </button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => goToWeek(shiftDays(weekStart, 7))}
        aria-label="Next week"
        className="w-7 h-7 flex items-center justify-center rounded-thumb text-ink-3 hover:text-ink hover:bg-paper-2 transition-colors"
      >
        <ChevronRight size={14} strokeWidth={1.6} />
      </button>
    </div>
  );
}
