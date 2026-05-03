import type { IconName } from "@/components/ds";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: "home" },
  { href: "/plan", label: "Plan", icon: "calendar" },
  { href: "/pantry", label: "Pantry", icon: "fridge" },
  { href: "/shop", label: "Shop", icon: "cart" },
  { href: "/me", label: "Me", icon: "user" },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/recipes", label: "Recipes", icon: "book" },
  { href: "/coach", label: "Coach", icon: "sparkle" },
  { href: "/programs", label: "Programs", icon: "flag" },
  { href: "/stats", label: "Stats", icon: "scale" },
];
