import type { Step } from "@/lib/types/database";

/** Strip data: URIs — they blow up HTML payloads if persisted. */
function sanitizeStepPhotoUrl(
  url: string | null | undefined,
): string | null | undefined {
  if (url == null || url === "") return url ?? undefined;
  if (url.startsWith("data:")) return undefined;
  return url;
}

export function sanitizeStepsForSave(
  steps: Array<{ text: string; timer_sec?: number; photo_url?: string | null }>,
): Step[] {
  return steps.map((s) => {
    const photo_url = sanitizeStepPhotoUrl(s.photo_url);
    const out: Step = { text: s.text };
    if (s.timer_sec != null && s.timer_sec > 0) out.timer_sec = s.timer_sec;
    if (photo_url) out.photo_url = photo_url;
    return out;
  });
}
