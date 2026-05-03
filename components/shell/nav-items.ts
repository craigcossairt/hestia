import type { IconName } from "@/components/ds";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

// Mobile tab bar: 5 slots, includes Me as the rightmost tab.
export const PRIMARY_NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: "home" },
  { href: "/plan", label: "Plan", icon: "calendar" },
  { href: "/pantry", label: "Pantry", icon: "fridge" },
  { href: "/shop", label: "Shop", icon: "cart" },
  { href: "/me", label: "Me", icon: "user" },
];

// Desktop sidebar: drops Me (handled by the user-menu at the bottom).
export const SIDEBAR_PRIMARY_NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: "home" },
  { href: "/plan", label: "Plan", icon: "calendar" },
  { href: "/pantry", label: "Pantry", icon: "fridge" },
  { href: "/shop", label: "Shop", icon: "cart" },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/recipes", label: "Recipes", icon: "book" },
  { href: "/coach", label: "Coach", icon: "sparkle" },
  { href: "/programs", label: "Programs", icon: "flag" },
  { href: "/family", label: "Family", icon: "heart" },
  { href: "/stats", label: "Stats", icon: "scale" },
];
