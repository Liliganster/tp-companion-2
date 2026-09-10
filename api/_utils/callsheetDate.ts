/** Calendar parsing is independent of upload time and server locale. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const months = new Map<string, number>();
for (const locale of ['en','de','es','fr','it','pt','nl','pl','cs','sk','hu','ro','da','sv','no','fi','tr','ru','uk']) {
  for (const width of ['long','short'] as const) {
    const formatter = new Intl.DateTimeFormat(locale,{month:width,day:'numeric',timeZone:'UTC'});
    for (let month=1; month<=12; month++) {
      const date = new Date(Date.UTC(2024,month-1,15));
      const name = formatter.formatToParts(date).find(part=>part.type==='month')?.value;
      if (name) months.set(fold(name).replace(/\.$/,''),month);
    }
  }
}
function iso(year: number, month: number, day: number): string {
  if(year<1900 || year>2099 || month<1 || month>12 || day<1 || day>31) return '';
  const value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const parsed=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===value ? value : '';
}
function candidates(text: string): string[] {
  const value=fold(text).replace(/(\d)(?:st|nd|rd|th)\b/g,'$1');
  const found=new Set<string>();
  const add=(y:number,m:number,d:number)=>{const date=iso(y,m,d); if(date) found.add(date);};
  for(const match of value.matchAll(/\b((?:19|20)\d{2})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})(?:日|\b)/g)) add(+match[1],+match[2],+match[3]);
  for(const match of value.matchAll(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*((?:19|20)\d{2})\b/g)) {
    add(+match[3],+match[2],+match[1]);
    add(+match[3],+match[1],+match[2]);
  }
  const tokens=value.match(/[\p{L}]+|\d+/gu)??[];
  const year=tokens.find(token=>/^(19|20)\d{2}$/.test(token));
  if(year) for(let i=0;i<tokens.length;i++) {
    const month=months.get(tokens[i]);
    if(!month) continue;
    const before=tokens.slice(Math.max(0,i-2),i).reverse().find(token=>/^\d{1,2}$/.test(token));
    const after=tokens.slice(i+1,i+3).find(token=>/^\d{1,2}$/.test(token));
    const day=before??after;
    if(day) add(+year,month,+day);
  }
  return [...found];
}
export function resolveCallsheetDate(args: {
  date: string; dateRaw?: string | null; dateYearInDocument?: boolean | null; referenceIso?: string;
}): string {
  const date=String(args.date??'').trim();
  const raw=String(args.dateRaw??'').trim();
  const modelIso=/^\d{4}-\d{2}-\d{2}$/.test(date) ? iso(+date.slice(0,4),+date.slice(5,7),+date.slice(8,10)) : '';
  const printedYear=/\b((?:19|20)\d{2})\b/.exec(raw)?.[1];
  if(printedYear && modelIso && printedYear!==modelIso.slice(0,4)) return '';
  const parsed=candidates(raw || date);
  const shortYear=raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b/);
  if(shortYear && modelIso && +modelIso.slice(2,4)===+shortYear[3]) {
    const year=+modelIso.slice(0,4);
    return [iso(year,+shortYear[2],+shortYear[1]),iso(year,+shortYear[1],+shortYear[2])].includes(modelIso) ? modelIso : '';
  }
  if(parsed.length===1) return parsed[0];
  if(parsed.length>1) return modelIso && parsed.includes(modelIso) ? modelIso : '';
  // An unrecognized language can still use the model's contextual ISO reading.
  if(modelIso && (printedYear || args.dateYearInDocument===true)) return modelIso;
  return '';
}
