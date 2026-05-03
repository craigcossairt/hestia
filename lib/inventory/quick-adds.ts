// Curated quick-add presets for the Inventory modal. Each entry maps a
// common item to its sensible default quantity + unit so "milk" becomes
// "1 gallon" and "bread" becomes "1 loaf". The selected location (passed
// from the modal) is kept — quick-add doesn't override the tab the user
// is on.

export interface QuickAddPreset {
  name: string;
  qty: number;
  unit: string;
}

export const QUICK_ADDS: QuickAddPreset[] = [
  { name: "eggs", qty: 12, unit: "each" },
  { name: "milk", qty: 1, unit: "gallon" },
  { name: "bread", qty: 1, unit: "loaf" },
  { name: "chicken breast", qty: 1, unit: "lb" },
  { name: "ground beef", qty: 1, unit: "lb" },
  { name: "rice", qty: 1, unit: "bag" },
  { name: "pasta", qty: 1, unit: "box" },
  { name: "olive oil", qty: 1, unit: "bottle" },
  { name: "garlic", qty: 1, unit: "head" },
  { name: "onion", qty: 1, unit: "each" },
  { name: "spinach", qty: 1, unit: "bag" },
  { name: "yogurt", qty: 1, unit: "container" },
  { name: "butter", qty: 4, unit: "stick" },
  { name: "cheese", qty: 1, unit: "block" },
  { name: "salt", qty: 1, unit: "each" },
  { name: "black beans", qty: 1, unit: "can" },
];
