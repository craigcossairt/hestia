// Shared noun singularization for grocery merge + cook-mode ingredient match.
// Conservative English suffix rules; false negatives are preferred over
// aggressive stemming.

const KEEP_AS_IS =
  /(oats|greens|grits|chips|sprouts|leaves|seeds|nuts|peas|berries|hummus|asparagus|citrus)$/;

export function singularizeNoun(name: string): string {
  const lower = name.toLowerCase();
  if (lower.length < 4) return name;
  if (KEEP_AS_IS.test(lower)) return name;
  if (lower.endsWith("ies")) return name.slice(0, -3) + "y";
  if (
    lower.endsWith("ches") ||
    lower.endsWith("shes") ||
    lower.endsWith("xes")
  ) {
    return name.slice(0, -2);
  }
  if (lower.endsWith("oes")) return name.slice(0, -2);
  if (lower.endsWith("s") && !lower.endsWith("ss")) return name.slice(0, -1);
  return name;
}
