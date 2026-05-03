"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Icon, Label } from "@/components/ds";
import {
  SIDEBAR_PRIMARY_NAV,
  SECONDARY_NAV,
  type NavItem,
} from "./nav-items";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { useUi } from "@/lib/store/ui";
import { cn } from "@/lib/utils";

interface SidebarProps {
  user: { name: string | null; email: string } | null;
  initialDark: boolean;
}

export function Sidebar({ user, initialDark }: SidebarProps) {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggle = useUi((s) => s.toggleSidebar);

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "hidden md:flex flex-col fixed left-0 top-0 bottom-0 bg-paper-2 border-r border-ink-l transition-[width] duration-200 z-40",
        collapsed ? "w-16 px-2 py-4" : "w-60 px-4 py-4",
      )}
    >
      {/* Logo */}
      <Link
        href="/today"
        className={cn(
          "flex items-center mb-6 group",
          collapsed ? "justify-center" : "px-1",
        )}
        aria-label="Hestia home"
      >
        {collapsed ? (
          <Image
            src="/logos/h-mark.png"
            alt="Hestia"
            width={512}
            height={512}
            priority
            className="h-9 w-9 group-hover:opacity-80 transition-opacity"
          />
        ) : (
          <Image
            src="/logos/wordmark.png"
            alt="Hestia"
            width={408}
            height={119}
            priority
            className="h-9 w-auto group-hover:opacity-80 transition-opacity"
          />
        )}
      </Link>

      {/* Primary nav */}
      <nav className="flex flex-col gap-1">
        {SIDEBAR_PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Library section */}
      {!collapsed ? (
        <div className="mt-6 mb-2 px-3">
          <Label>library</Label>
        </div>
      ) : (
        <div className="my-3 mx-3 border-t border-ink-l/40" />
      )}
      <nav className="flex flex-col gap-1">
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Bottom: theme + collapse toolbar, then user menu */}
      <div className="mt-auto flex flex-col">
        <div
          className={cn(
            "flex items-center pb-2",
            collapsed ? "flex-col gap-1" : "justify-between px-1",
          )}
        >
          <ThemeToggle initialDark={initialDark} collapsed={collapsed} />
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-9 h-9 flex items-center justify-center rounded-thumb text-ink-3 hover:text-ink hover:bg-paper-3 transition-colors"
          >
            {collapsed ? (
              <ChevronsRight size={16} strokeWidth={1.5} />
            ) : (
              <ChevronsLeft size={16} strokeWidth={1.5} />
            )}
          </button>
        </div>

        {user ? (
          <UserMenu name={user.name} email={user.email} collapsed={collapsed} />
        ) : null}
      </div>
    </aside>
  );
}

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center rounded-thumb font-sans text-[14px] transition-colors",
        collapsed ? "justify-center w-12 h-10 mx-auto" : "gap-3 px-3 py-2",
        active
          ? "bg-accent-tint text-ink"
          : "text-ink-2 hover:bg-paper-3 hover:text-ink",
      )}
    >
      <Icon name={item.icon} size={18} />
      {!collapsed ? <span>{item.label}</span> : null}
    </Link>
  );
}
