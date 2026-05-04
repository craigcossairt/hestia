"use client";

import { useTransition } from "react";
import { setGroceryItemsChecked } from "@/app/(app)/shop/actions";

interface BulkActionLinkProps {
  // All item keys this control should toggle. Usually one section's items
  // (per-section button) or the whole list (top-of-page button).
  itemKeys: string[];
  // What to do when clicked. "check" marks everything in the set; "uncheck"
  // unmarks everything in the set.
  action: "check" | "uncheck";
  children: React.ReactNode;
  className?: string;
}

// Compact text-button used in the section header rows on /shop.
// Server action handles the upsert; we just optimistically blur and let
// the page revalidate.
export function BulkActionLink({
  itemKeys,
  action,
  children,
  className,
}: BulkActionLinkProps) {
  const [pending, start] = useTransition();
  function click() {
    if (itemKeys.length === 0) return;
    start(async () => {
      await setGroceryItemsChecked(itemKeys, action === "check");
    });
  }
  return (
    <button
      type="button"
      onClick={click}
      disabled={pending || itemKeys.length === 0}
      className={
        className ??
        "font-mono text-[10px] uppercase tracking-wider text-ink-3 hover:text-ink transition-colors disabled:opacity-40"
      }
    >
      {pending ? "…" : children}
    </button>
  );
}
