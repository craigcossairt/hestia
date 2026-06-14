// Extract a timer duration (seconds) from free-text recipe step prose.

function parseMinutesToken(token: string): number | null {
  const t = token.trim().toLowerCase();
  const range = t.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    return (Number(range[1]) + Number(range[2])) / 2;
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Finds duration mentions in step text and returns the longest in seconds.
 * Handles "55–65 minutes", "10 min", "2 hours", "30 seconds".
 */
export function parseStepTimer(text: string): number | null {
  if (!text.trim()) return null;
  const normalized = text.replace(/[\u2013\u2014]/g, "-").toLowerCase();

  const candidates: number[] = [];

  for (const m of normalized.matchAll(
    /(\d+(?:\s*-\s*\d+)?)\s*(?:to\s+(\d+)\s+)?(?:min(?:ute)?s?|mins?)\b/g,
  )) {
    const primary = parseMinutesToken(m[1]);
    if (primary != null) candidates.push(primary);
    if (m[2]) {
      const upper = Number(m[2]);
      if (Number.isFinite(upper) && upper > 0) candidates.push(upper);
    }
  }

  for (const m of normalized.matchAll(
    /(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*(?:hr|hour|hours)\b/g,
  )) {
    const hrs = parseMinutesToken(m[1]);
    if (hrs != null) candidates.push(hrs * 60);
  }

  for (const m of normalized.matchAll(/(\d+(?:\s*-\s*\d+)?)\s*(?:sec(?:ond)?s?)\b/g)) {
    const token = m[1];
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    const sec = range
      ? (Number(range[1]) + Number(range[2])) / 2
      : Number(token);
    if (Number.isFinite(sec) && sec > 0) candidates.push(sec / 60);
  }

  if (candidates.length === 0) return null;
  const maxMin = Math.max(...candidates);
  return Math.round(maxMin * 60);
}
