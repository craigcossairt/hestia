"use client";

import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { useUi } from "@/lib/store/ui";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  user: { name: string | null; email: string } | null;
  initialDark: boolean;
}

export function AppShell({ children, user, initialDark }: AppShellProps) {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  return (
    <div className="min-h-screen">
      <Sidebar user={user} initialDark={initialDark} />
      <main
        className={cn(
          "pb-24 md:pb-12 min-h-screen transition-[margin-left] duration-200",
          collapsed ? "md:ml-16" : "md:ml-60",
        )}
      >
        {children}
      </main>
      <TabBar initialDark={initialDark} />
    </div>
  );
}
