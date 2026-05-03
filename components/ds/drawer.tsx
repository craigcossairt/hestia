"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  side?: "right" | "bottom";
}

export function Drawer({ open, onClose, children, className, side = "right" }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const sideClass =
    side === "right"
      ? "right-0 top-0 bottom-0 w-full max-w-md border-l rounded-l-card"
      : "left-0 right-0 bottom-0 max-h-[80vh] border-t rounded-t-card";

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 animate-in fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "absolute bg-card border-ink-l shadow-[var(--shadow-2)] flex flex-col overflow-auto",
          sideClass,
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
