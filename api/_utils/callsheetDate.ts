/** Missing years require review; upload time and weekday arithmetic are not evidence. */
export function resolveCallsheetDate(args: {
  date: string; dateRaw?: string | null; dateYearInDocument?: boolean | null;
  referenceIso?: string;
}): string {
  const date = String(args.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return '';
  const printedYear = /\b((?:19|20)\d{2})\b/.exec(args.dateRaw ?? '')?.[1];
  if (printedYear && printedYear !== date.slice(0, 4)) return '';
  return printedYear || args.dateYearInDocument === true ? date : '';
}
