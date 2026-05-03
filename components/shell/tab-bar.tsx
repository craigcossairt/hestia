"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ds";
import { PRIMARY_NAV } from "./nav-items";
import { cn } from "@/lib/utils";

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 bg-card border-t border-ink-l"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {PRIMARY_NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
              active ? "text-ink" : "text-ink-3",
            )}
          >
            <Icon name={item.icon} size={20} />
            <span className="text-[10px] font-mono uppercase tracking-wider">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
