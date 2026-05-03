"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Label, H } from "@/components/ds";
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "./nav-items";
import { cn } from "@/lib/utils";

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-thumb font-sans text-[14px] transition-colors",
        active
          ? "bg-accent-tint text-ink"
          : "text-ink-2 hover:bg-paper-2 hover:text-ink",
      )}
    >
      <Icon name={item.icon} size={18} />
      <span>{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 px-4 py-6 bg-paper-2 border-r border-ink-l">
      <Link href="/today" className="flex items-center gap-2 px-3 mb-8">
        <H size="md">Hestia</H>
      </Link>

      <nav className="flex flex-col gap-1">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      <div className="mt-8 mb-2 px-3">
        <Label>library</Label>
      </div>
      <nav className="flex flex-col gap-1">
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      <div className="mt-auto px-3 pt-4 border-t border-ink-l/50">
        <Label>v0.1 · personal build</Label>
      </div>
    </aside>
  );
}
