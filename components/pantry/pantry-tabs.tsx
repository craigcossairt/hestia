"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const LOCATIONS = [
  { id: "pantry", label: "Pantry" },
  { id: "fridge", label: "Fridge" },
  { id: "freezer", label: "Freezer" },
  { id: "spices", label: "Spices" },
] as const;

export function PantryTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("loc") ?? "pantry";

  return (
    <div className="flex gap-1 p-1 bg-paper-2 rounded-thumb w-fit overflow-x-auto">
      {LOCATIONS.map((l) => (
        <Link
          key={l.id}
          href={`${pathname}?loc=${l.id}`}
          scroll={false}
          className={cn(
            "px-4 py-1.5 rounded-thumb font-sans text-[13px] transition-colors",
            active === l.id
              ? "bg-card text-ink shadow-[var(--shadow-1)]"
              : "text-ink-3 hover:text-ink",
          )}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
