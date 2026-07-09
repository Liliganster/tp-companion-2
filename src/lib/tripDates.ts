/** Fecha de un viaje como Date local (YYYY-MM-DD sin deriva de zona horaria). */
export function parseTripDate(value: string): Date | null {
  if (!value) return null;

  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(value);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(year, month - 1, day);
  }

  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt : null;
}
