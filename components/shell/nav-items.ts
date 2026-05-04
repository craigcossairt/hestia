import type { IconName } from "@/components/ds";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

// Mobile tab bar: 4 primary slots + a hard-coded "More" 5th tab that
// opens a sheet containing everything else (Library + Me + sign out).
// "More" used to be "Me" but that left the 5 Library destinations
// (Recipes, Coach, Programs, Family, Stats) with no mobile entry point
// — desktop has a dedicated sidebar section for them.
export const PRIMARY_NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: "home" },
  { href: "/plan", label: "Plan", icon: "calendar" },
  { href: "/inventory", label: "Inventory", icon: "fridge" },
  { href: "/shop", label: "Shop", icon: "cart" },
];

// Desktop sidebar: same primary destinations as mobile (Me lives in
// the user-menu at the bottom of the sidebar instead of a tab).
export const SIDEBAR_PRIMARY_NAV: NavItem[] = PRIMARY_NAV;

// Library section — appears in the desktop sidebar under the primary
// nav, and in the mobile More sheet.
export const SECONDARY_NAV: NavItem[] = [
  { href: "/recipes", label: "Recipes", icon: "book" },
  { href: "/coach", label: "Coach", icon: "sparkle" },
  { href: "/programs", label: "Programs", icon: "flag" },
  { href: "/family", label: "Family", icon: "heart" },
  { href: "/stats", label: "Stats", icon: "scale" },
];

// Convenience: every href the More sheet covers, used to decide whether
// the mobile More tab should render in its active state.
export const MORE_SHEET_HREFS: string[] = [
  ...SECONDARY_NAV.map((n) => n.href),
  "/me",
];
