// Parse a single pasted ingredient line into qty / unit / name.
// Handles unicode fractions (½, 1¾), vulgar fractions (1/2), and
// ranges (3–4) common in home-recipe copy/paste.

export interface ParsedIngredient {
  qty: number;
  unit: string;
  name: string;
}

const UNICODE_FRACTION: Record<string, number> = {
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

const UNIT_ALIASES: Record<string, string> = {
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

function expandUnicodeFractions(text: string): string {
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

function parseNumberToken(token: string): number | null {
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
function parseQtyToken(token: string): number | null {
  const t = token.trim();
  const range = t.match(/^(\d+(?:\.\d+)?(?:\/\d+)?)\s*-\s*(\d+(?:\.\d+)?(?:\/\d+)?)$/);
  if (range) {
    const a = parseNumberToken(range[1]);
    const b = parseNumberToken(range[2]);
    if (a != null && b != null) return (a + b) / 2;
    return null;
  }
  return parseNumberToken(t);
}

function normalizeUnit(raw: string): string {
  const key = raw.toLowerCase().replace(/\./g, "");
  return UNIT_ALIASES[key] ?? raw.toLowerCase();
}

const KNOWN_UNITS = new Set(Object.values(UNIT_ALIASES));

function isKnownUnit(word: string): boolean {
  const n = normalizeUnit(word);
  return KNOWN_UNITS.has(n);
}

/**
 * Returns parsed fields when the line looks like "½ cup flour" or
 * "3-4 ripe bananas". Returns null when there's no leading quantity.
 */
export function parseIngredientLine(line: string): ParsedIngredient | null {
  let text = line.trim();
  if (!text) return null;

  text = expandUnicodeFractions(text);

  // Leading parenthetical weight: "(170–200g) chocolate chips"
  const paren = text.match(
    /^\((\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(g|kg|oz|lb)\)\s*/i,
  );
  if (paren) {
    const avg = (Number(paren[1]) + Number(paren[2])) / 2;
    const unit = paren[3].toLowerCase();
    const name = text.slice(paren[0].length).trim();
    if (name) return { qty: avg, unit, name };
  }

  // qty + unit + name  OR  qty + name (count)
  const withUnit = text.match(
    /^(\d+(?:\.\d+)?(?:\/\d+)?(?:\s*-\s*\d+(?:\.\d+)?(?:\/\d+)?)?)\s+([a-zA-Z][\w.]*)\s+(.+)$/,
  );
  if (withUnit) {
    const qty = parseQtyToken(withUnit[1]);
    if (qty == null || qty <= 0) return null;
    const maybeUnit = withUnit[2];
    if (isKnownUnit(maybeUnit)) {
      return {
        qty,
        unit: normalizeUnit(maybeUnit),
        name: withUnit[3].trim(),
      };
    }
  }

  const countOnly = text.match(
    /^(\d+(?:\.\d+)?(?:\/\d+)?(?:\s*-\s*\d+(?:\.\d+)?(?:\/\d+)?)?)\s+(.+)$/,
  );
  if (countOnly) {
    const qty = parseQtyToken(countOnly[1]);
    if (qty == null || qty <= 0) return null;
    const rest = countOnly[2].trim();
    // "2 large eggs" — unit is size descriptor
    const sizeMatch = rest.match(/^(large|medium|small)\s+(.+)$/i);
    if (sizeMatch) {
      return {
        qty,
        unit: sizeMatch[1].toLowerCase(),
        name: sizeMatch[2].trim(),
      };
    }
    return { qty, unit: "each", name: rest };
  }

  return null;
}

/** Split pasted blob into lines and parse each into ingredient rows. */
export function parseIngredientPaste(blob: string): ParsedIngredient[] {
  return blob
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => parseIngredientLine(line) ?? { qty: 1, unit: "each", name: line });
}
