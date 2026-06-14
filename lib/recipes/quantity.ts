// Quantity parsing and fraction display for recipe ingredients.

export const UNICODE_FRACTION: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

export const UNIT_ALIASES: Record<string, string> = {
  c: "cup",
  cups: "cup",
  cup: "cup",
  tbsp: "tablespoon",
  tbs: "tablespoon",
  tablespoon: "tablespoon",
  tablespoons: "tablespoon",
  tsp: "teaspoon",
  teaspoon: "teaspoon",
  teaspoons: "teaspoon",
  oz: "ounce",
  ounce: "ounce",
  ounces: "ounce",
  lb: "pound",
  lbs: "pound",
  pound: "pound",
  pounds: "pound",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  liter: "l",
  litre: "l",
  stick: "stick",
  sticks: "stick",
  clove: "clove",
  cloves: "clove",
  large: "large",
  medium: "medium",
  small: "small",
  each: "each",
  ea: "each",
  can: "can",
  cans: "can",
  package: "package",
  pkg: "package",
  slice: "slice",
  slices: "slice",
  pinch: "pinch",
  pinches: "pinch",
};

/** Canonical units for recipe edit dropdown (common cooking units first). */
export const RECIPE_UNIT_OPTIONS = [
  "each",
  "cup",
  "tablespoon",
  "teaspoon",
  "ounce",
  "pound",
  "g",
  "kg",
  "ml",
  "l",
  "stick",
  "clove",
  "large",
  "medium",
  "small",
  "can",
  "package",
  "slice",
  "pinch",
] as const;

export function normalizeRecipeUnit(raw: string): string {
  const key = raw.toLowerCase().replace(/\./g, "");
  return UNIT_ALIASES[key] ?? raw.toLowerCase();
}

export function expandUnicodeFractions(text: string): string {
  let s = text.replace(/[\u2013\u2014]/g, "-");
  s = s.replace(/(\d)([½⅓⅔¼¾⅛⅜⅝⅞])/g, (_, whole, frac) => {
    const n = Number(whole) + (UNICODE_FRACTION[frac] ?? 0);
    return String(n);
  });
  for (const [char, val] of Object.entries(UNICODE_FRACTION)) {
    s = s.replaceAll(char, String(val));
  }
  return s;
}

export function parseNumberToken(token: string): number | null {
  const t = token.trim();
  if (!t) return null;
  if (t.includes("/")) {
    const [a, b] = t.split("/").map(Number);
    if (b > 0 && Number.isFinite(a) && Number.isFinite(b)) return a / b;
    return null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "3-4" or "55-65" → average; single number passthrough. */
export function parseQtyToken(token: string): number | null {
  const t = token.trim();
  const range = t.match(
    /^(\d+(?:\.\d+)?(?:\/\d+)?)\s*-\s*(\d+(?:\.\d+)?(?:\/\d+)?)$/,
  );
  if (range) {
    const a = parseNumberToken(range[1]);
    const b = parseNumberToken(range[2]);
    if (a != null && b != null) return (a + b) / 2;
    return null;
  }
  return parseNumberToken(t);
}

/** Parse user-entered quantity: decimals, fractions, mixed numbers, unicode. */
export function parseQuantityInput(input: string): number | null {
  let text = input.trim();
  if (!text) return null;
  text = expandUnicodeFractions(text);

  const mixed = text.match(/^(\d+)\s+(\d+\/\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const frac = parseNumberToken(mixed[2]);
    if (Number.isFinite(whole) && frac != null) return whole + frac;
  }

  return parseQtyToken(text);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

function simplifyFraction(num: number, den: number): { num: number; den: number } {
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

function decimalToFraction(
  decimal: number,
  maxDenom = 16,
): { num: number; den: number } | null {
  const epsilon = 0.02;
  let best: { num: number; den: number; err: number } | null = null;

  for (let den = 2; den <= maxDenom; den++) {
    const num = Math.round(decimal * den);
    if (num <= 0 || num >= den) continue;
    const err = Math.abs(decimal - num / den);
    if (err < epsilon && (best == null || err < best.err)) {
      best = { num, den, err };
    }
  }

  if (!best) return null;
  return simplifyFraction(best.num, best.den);
}

/** Display a stored numeric qty as a cooking-friendly fraction when possible. */
export function formatQuantity(qty: number): string {
  if (!Number.isFinite(qty)) return String(qty);
  if (qty <= 0) return String(qty);

  const whole = Math.floor(qty + 1e-9);
  const frac = qty - whole;

  if (frac < 1e-6) return String(whole);

  const f = decimalToFraction(frac);
  if (!f) {
    const rounded = Math.round(qty * 1000) / 1000;
    return String(rounded).replace(/\.?0+$/, "");
  }

  const fracStr = `${f.num}/${f.den}`;
  if (whole === 0) return fracStr;
  return `${whole} ${fracStr}`;
}
