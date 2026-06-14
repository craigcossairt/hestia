/** Split stored seconds into whole hours and minutes for edit UI. */
export function splitStepTimer(sec: number | undefined | null): {
  hours: number;
  minutes: number;
} {
  if (sec == null || sec <= 0) return { hours: 0, minutes: 0 };
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return { hours, minutes };
}

/** Combine hours and minutes into seconds for storage. */
export function combineStepTimer(
  hours: number,
  minutes: number,
): number | undefined {
  const h = Number.isFinite(hours) ? Math.max(0, Math.floor(hours)) : 0;
  const m = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  const total = h * 3600 + m * 60;
  return total > 0 ? total : undefined;
}
