"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";
import { cn } from "@/lib/utils";

interface UserMenuProps {
  name: string | null;
  email: string;
  collapsed: boolean;
}

function initials(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return email[0].toUpperCase();
}

export function UserMenu({ name, email, collapsed }: UserMenuProps) {
  const pathname = usePathname();
  const onMe = pathname === "/me" || pathname.startsWith("/me/");
  const init = initials(name, email);
  const display = name?.trim() || email.split("@")[0];

  return (
    <div
      className={cn(
        "border-t border-ink-l/50 pt-3 mt-2 flex items-center gap-2",
        collapsed ? "flex-col" : "flex-row",
      )}
    >
      <Link
        href="/me"
        title={`${display} — open profile`}
        className={cn(
          "flex items-center gap-2.5 rounded-thumb transition-colors flex-1 min-w-0",
          collapsed ? "p-1 justify-center w-full" : "p-2 hover:bg-paper-3",
          onMe && !collapsed && "bg-paper-3",
        )}
      >
        <div
          className={cn(
            "w-9 h-9 shrink-0 rounded-full bg-accent text-paper flex items-center justify-center font-mono text-[12px] font-medium",
            "[font-variant-numeric:tabular-nums]",
            "ring-2 ring-transparent transition-all",
            onMe && "ring-accent",
          )}
        >
          {init}
        </div>
        {!collapsed ? (
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-ink font-sans text-[13px] font-medium truncate">
              {display}
            </span>
            <span className="text-ink-3 font-sans text-[10.5px] truncate">
              {email}
            </span>
          </div>
        ) : null}
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          title="Sign out"
          aria-label="Sign out"
          className={cn(
            "flex items-center justify-center rounded-thumb text-ink-3 hover:text-danger hover:bg-paper-3 transition-colors",
            collapsed ? "w-9 h-9" : "w-9 h-9",
          )}
        >
          <LogOut size={15} strokeWidth={1.5} />
        </button>
      </form>
    </div>
  );
}
