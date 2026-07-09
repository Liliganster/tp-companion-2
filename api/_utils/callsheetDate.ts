/**
 * Resolución del año de la fecha de rodaje — Fase 2 del PLAN.md.
 *
 * Las callsheets a menudo omiten el año ("Tuesday, 19th Nov"). La IA no debe
 * inventarlo: el CÓDIGO lo infiere eligiendo el año que acerque la fecha a la
 * fecha de subida, y si el documento trae el día de la semana, se usa para
 * desambiguar (un mes+día solo cae en ese día de semana ~cada 5-11 años).
 */

const WEEKDAYS: Record<string, number> = {
  // en
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  // de
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
};

function weekdayFromText(text: string | null | undefined): number | null {
  const t = String(text ?? "").toLowerCase();
  for (const [name, day] of Object.entries(WEEKDAYS)) {
    if (t.includes(name)) return day;
  }
  return null;
}

function hasExplicitYear(text: string | null | undefined): boolean {
  return /\b(19|20)\d{2}\b/.test(String(text ?? ""));
}

function utcDate(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  // Rechaza desbordes tipo 31-02 → 03-03 (y 29-02 en años no bisiestos).
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

export function resolveCallsheetDate(args: {
  /** Fecha YYYY-MM-DD que devolvió la IA. */
  date: string;
  /** Texto literal de la fecha en el documento (para año explícito y día de semana). */
  dateRaw?: string | null;
  /** Señal de la IA: el año está impreso en el documento. */
  dateYearInDocument?: boolean | null;
  /** Fecha de referencia (subida del callsheet), ISO. */
  referenceIso: string;
}): string {
  const { date, dateRaw, dateYearInDocument, referenceIso } = args;

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? "").trim());
  if (!m) return date;
  const [, , mm, dd] = m;
  const month = Number(mm);
  const day = Number(dd);

  // Año explícito en el documento (señal de la IA o un año de 4 cifras en el
  // texto literal): se respeta lo extraído.
  if (dateYearInDocument === true || hasExplicitYear(dateRaw)) return date;

  const reference = new Date(referenceIso);
  const refTime = Number.isFinite(reference.getTime()) ? reference.getTime() : Date.now();
  const refYear = new Date(refTime).getUTCFullYear();

  // Candidatos: mismo mes+día en una ventana de años alrededor de la subida.
  // (ref-2 permite evaluar callsheets antiguas; en producción se sube la misma semana.)
  const candidates: Date[] = [];
  for (let y = refYear - 2; y <= refYear + 1; y += 1) {
    const c = utcDate(y, month, day);
    if (c) candidates.push(c);
  }
  if (candidates.length === 0) return date;

  // Si el documento trae día de semana, filtra los años que caen en ese día.
  const weekday = weekdayFromText(dateRaw);
  const pool = weekday == null ? candidates : candidates.filter((c) => c.getUTCDay() === weekday);
  const finalPool = pool.length > 0 ? pool : candidates;

  // El candidato más cercano a la fecha de subida gana.
  finalPool.sort((a, b) => Math.abs(a.getTime() - refTime) - Math.abs(b.getTime() - refTime));
  return finalPool[0].toISOString().slice(0, 10);
}
