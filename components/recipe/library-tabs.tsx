"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "all", label: "All" },
  { id: "saved", label: "Saved" },
  { id: "rated", label: "Rated" },
] as const;

export type RecipeTab = (typeof TABS)[number]["id"];

export function LibraryTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = (params.get("tab") as RecipeTab | null) ?? "all";

  return (
    <div className="flex gap-1 p-1 bg-paper-2 rounded-thumb w-fit">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={`${pathname}?tab=${t.id}`}
          scroll={false}
          className={cn(
            "px-4 py-1.5 rounded-thumb font-sans text-[13px] transition-colors",
            active === t.id
              ? "bg-card text-ink shadow-[var(--shadow-1)]"
              : "text-ink-3 hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
