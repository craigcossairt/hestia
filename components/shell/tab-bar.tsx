"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ds";
import { Drawer } from "@/components/ds/drawer";
import { signOut } from "@/app/(auth)/login/actions";
import { ThemeToggle } from "./theme-toggle";
import {
  PRIMARY_NAV,
  SECONDARY_NAV,
  MORE_SHEET_HREFS,
  type NavItem,
} from "./nav-items";
import { cn } from "@/lib/utils";

interface TabBarProps {
  initialDark: boolean;
}

export function TabBar({ initialDark }: TabBarProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the sheet on route change so the overlay doesn't linger over
  // the new page if the user navigates via OS back-button or any path
  // change other than tapping a sheet link (those already self-close
  // via SheetLink.onSelect). Synchronising UI state to a derived
  // navigation value is the legitimate "external system" use the
  // react-hooks/set-state-in-effect rule allows for.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMoreOpen(false);
  }, [pathname]);

  const moreActive = MORE_SHEET_HREFS.some(
    (h) => pathname === h || pathname.startsWith(`${h}/`),
  );

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 bg-card border-t border-ink-l"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {PRIMARY_NAV.map((item) => (
          <TabLink key={item.href} item={item} pathname={pathname} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-label="More — Recipes, Coach, Programs, Family, Stats, Profile"
          className={cn(
            "flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
            moreActive || moreOpen ? "text-ink" : "text-ink-3",
          )}
        >
          <Icon name="more" size={20} />
          <span className="text-[10px] font-mono uppercase tracking-wider">
            More
          </span>
        </button>
      </nav>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} side="bottom">
        <MoreSheetContent
          pathname={pathname}
          initialDark={initialDark}
          onClose={() => setMoreOpen(false)}
        />
      </Drawer>
    </>
  );
}

function TabLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
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
}

function MoreSheetContent({
  pathname,
  initialDark,
  onClose,
}: {
  pathname: string;
  initialDark: boolean;
  onClose: () => void;
}) {
  return (
    <div className="px-4 pt-3 pb-6 flex flex-col gap-1">
      {/* Drag handle */}
      <div className="self-center w-10 h-1 rounded-full bg-ink-l mb-3" />

      <div className="px-1 mb-1">
        <span className="text-ink-3 text-[10px] font-mono uppercase tracking-wider">
          Library
        </span>
      </div>
      {SECONDARY_NAV.map((item) => (
        <SheetLink
          key={item.href}
          item={item}
          pathname={pathname}
          onSelect={onClose}
        />
      ))}

      <div className="px-1 mt-4 mb-1">
        <span className="text-ink-3 text-[10px] font-mono uppercase tracking-wider">
          Account
        </span>
      </div>
      <SheetLink
        item={{ href: "/me", label: "Profile", icon: "user" }}
        pathname={pathname}
        onSelect={onClose}
      />

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-ink-l/50">
        <ThemeToggle initialDark={initialDark} />
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-2 px-3 h-9 rounded-thumb text-ink-3 hover:text-danger hover:bg-paper-3 transition-colors text-[13px] font-sans"
          >
            <Icon name="logout" size={16} />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </div>
  );
}

function SheetLink({
  item,
  pathname,
  onSelect,
}: {
  item: NavItem;
  pathname: string;
  onSelect: () => void;
}) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 px-3 py-3 rounded-thumb font-sans text-[15px] transition-colors",
        active ? "bg-accent-tint text-ink" : "text-ink-2 hover:bg-paper-3",
      )}
    >
      <Icon name={item.icon} size={20} />
      <span>{item.label}</span>
    </Link>
  );
}
