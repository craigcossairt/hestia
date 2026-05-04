// Curated quick-add presets for the Inventory modal. Each entry maps a
// common item to its sensible default quantity + unit so "milk" becomes
// "1 gallon" and "bread" becomes "1 loaf". The `locations` array tells
// the modal which storage tab the chip is relevant for — milk shouldn't
// show on the Pantry or Spices tab.

import type { PantryLocation } from "@/lib/types/database";

export interface QuickAddPreset {
  name: string;
  qty: number;
  unit: string;
  // Where the chip should appear. Omit for "any tab".
  locations: PantryLocation[];
}

export const QUICK_ADDS: QuickAddPreset[] = [
  // Fridge
  { name: "eggs", qty: 12, unit: "each", locations: ["fridge"] },
  { name: "milk", qty: 1, unit: "gallon", locations: ["fridge"] },
  { name: "yogurt", qty: 1, unit: "container", locations: ["fridge"] },
  { name: "butter", qty: 4, unit: "stick", locations: ["fridge"] },
  { name: "cheese", qty: 1, unit: "block", locations: ["fridge"] },
  { name: "chicken breast", qty: 1, unit: "lb", locations: ["fridge", "freezer"] },
  { name: "ground beef", qty: 1, unit: "lb", locations: ["fridge", "freezer"] },
  { name: "spinach", qty: 1, unit: "bag", locations: ["fridge"] },
  // Pantry
  { name: "bread", qty: 1, unit: "loaf", locations: ["pantry"] },
  { name: "rice", qty: 1, unit: "bag", locations: ["pantry"] },
  { name: "pasta", qty: 1, unit: "box", locations: ["pantry"] },
  { name: "olive oil", qty: 1, unit: "bottle", locations: ["pantry"] },
  { name: "garlic", qty: 1, unit: "head", locations: ["pantry"] },
  { name: "onion", qty: 1, unit: "each", locations: ["pantry"] },
  { name: "black beans", qty: 1, unit: "can", locations: ["pantry"] },
  { name: "chicken broth", qty: 1, unit: "carton", locations: ["pantry"] },
  // Freezer
  { name: "frozen berries", qty: 1, unit: "bag", locations: ["freezer"] },
  { name: "frozen vegetables", qty: 1, unit: "bag", locations: ["freezer"] },
  // Spices
  { name: "salt", qty: 1, unit: "each", locations: ["spices"] },
  { name: "black pepper", qty: 1, unit: "each", locations: ["spices"] },
  { name: "garlic powder", qty: 1, unit: "each", locations: ["spices"] },
  { name: "paprika", qty: 1, unit: "each", locations: ["spices"] },
  { name: "cumin", qty: 1, unit: "each", locations: ["spices"] },
  { name: "olive oil", qty: 1, unit: "bottle", locations: ["spices"] },
];

export function quickAddsForLocation(loc: PantryLocation): QuickAddPreset[] {
  return QUICK_ADDS.filter((q) => q.locations.includes(loc));
}
