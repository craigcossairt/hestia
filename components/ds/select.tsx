"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  className?: string;
  placeholder?: string;
  // "right" (default) for compact field-row contexts; "left" for a full-width dropdown
  align?: "left" | "right";
  ariaLabel?: string;
  // Stretch the trigger button to fill its container (for grid-cell
  // contexts where the cell defines the width and we want the entire
  // cell to be a tap target — otherwise the button is just inline-flex
  // sized to its label, which is hard to hit on a phone).
  fullWidth?: boolean;
}

// Custom select that fully styles its popover so dark-mode rendering doesn't
// rely on OS-level native control chrome (which is unreliably colored in
// Chromium on Windows even with color-scheme: dark).
export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  placeholder,
  align = "right",
  ariaLabel,
  fullWidth,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % options.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + options.length) % options.length);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const opt = options[highlight];
        if (opt) {
          onChange(opt.value);
          setOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, highlight, options, onChange]);

  function toggle() {
    setOpen((cur) => {
      if (!cur) {
        const idx = options.findIndex((o) => o.value === value);
        setHighlight(idx >= 0 ? idx : 0);
      }
      return !cur;
    });
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative",
        fullWidth ? "block w-full" : "inline-block",
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          "items-center gap-1.5 bg-transparent text-ink font-sans text-[14px] outline-none cursor-pointer",
          fullWidth
            ? "flex w-full justify-between"
            : "inline-flex",
          !fullWidth &&
            (align === "right" ? "text-right justify-end" : "text-left justify-start"),
        )}
      >
        <span className={cn(!selected && "text-ink-3")}>
          {selected?.label ?? placeholder ?? "—"}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.6}
          className={cn(
            "text-ink-3 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <ul
          role="listbox"
          className={cn(
            "absolute z-50 mt-1 min-w-[10rem] max-h-64 overflow-auto py-1 rounded-thumb border border-ink-l bg-card shadow-[var(--shadow-2)]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isHighlight = i === highlight;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "px-3 py-2 font-sans text-[13.5px] cursor-pointer flex items-center justify-between gap-3",
                  isHighlight ? "bg-accent-tint text-accent" : "text-ink",
                )}
              >
                <span>{opt.label}</span>
                {isSelected ? (
                  <Check
                    size={13}
                    strokeWidth={2.2}
                    className={isHighlight ? "text-accent" : "text-ink-3"}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
