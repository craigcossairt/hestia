// Unit conversions. DB stores canonical metric (cm, kg); UI displays US.

export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inches = Math.round(totalIn - ft * 12);
  // Roll over 12" → next foot
  if (inches === 12) return { ft: ft + 1, in: 0 };
  return { ft, in: inches };
}

export function ftInToCm(ft: number, inches: number): number {
  return Math.round((ft * 12 + inches) * 2.54);
}

export function kgToLb(kg: number): number {
  return Math.round(kg * 2.2046226218);
}

export function lbToKg(lb: number): number {
  return Math.round(lb / 2.2046226218);
}
