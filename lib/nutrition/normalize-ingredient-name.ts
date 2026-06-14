/**
 * Strip parenthetical weights, prep notes, and comma clauses so USDA FDC
 * search gets a clean food name ("all-purpose flour" not "(220g) flour…").
 */
export function normalizeIngredientNameForFdc(name: string): string {
  let s = name.trim();
  if (!s) return s;

  while (/^\([^)]*\)\s*/.test(s)) {
    s = s.replace(/^\([^)]*\)\s*/, "");
  }

  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  }

  const commaIdx = s.indexOf(",");
  if (commaIdx > 0) {
    const head = s.slice(0, commaIdx).trim();
    if (head.length >= 3) s = head;
  }

  s = s.replace(/\s*plus\b.*/i, "").trim();
  s = s.replace(/^(a|an|the)\s+/i, "");

  return s.trim() || name.trim();
}
