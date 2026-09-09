import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseDelimitedRows, rowsToCsv } from '@/lib/importDocuments';
import { useI18n } from '@/hooks/use-i18n';

export type ImportTable = { name: string; text: string };
export function ManualImportPreview({ tables, onChange, disabled }: { tables: ImportTable[]; onChange: (tables: ImportTable[]) => void; disabled: boolean }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(0);
  const [page, setPage] = useState(0);
  const index = Math.min(selected, Math.max(0, tables.length - 1));
  if (!tables.length) return null;
  const rows = parseDelimitedRows(tables[index].text);
  const pageIndex = Math.min(page, Math.max(0, Math.ceil((rows.length - 1) / 20) - 1));
  return <div className="space-y-3">
    <p className="text-sm">{t('bulk.manualReview')}</p>
    <div className="flex flex-wrap gap-2">{tables.map((table, i) => <div key={`${table.name}-${i}`} className="flex items-center gap-1">
      <Button type="button" variant={index === i ? 'secondary' : 'outline'} disabled={disabled} onClick={() => { setSelected(i); setPage(0); }}>{table.name}</Button>
      <Button type="button" variant="ghost" disabled={disabled} aria-label={`${t('bulk.removeFile')} ${table.name}`} onClick={() => onChange(tables.filter((_, n) => n !== i))}>×</Button>
    </div>)}</div>
    <div className="max-h-80 overflow-auto rounded border"><table className="w-full text-xs">
      <thead><tr><th>#</th>{rows[0]?.map((header, i) => <th className="p-2" key={i}>{header}</th>)}<th /></tr></thead>
      <tbody>{rows.slice(1 + pageIndex * 20, 21 + pageIndex * 20).map((row, n) => {
        const rowIndex = 1 + pageIndex * 20 + n;
        return <tr key={rowIndex}><td>{rowIndex}</td>{rows[0]?.map((header, c) => <td key={c} className="p-1"><Input className="min-w-36" disabled={disabled} aria-label={`${header} ${rowIndex}`} value={row[c] ?? ''} onChange={e => {
          const next = rows.map(r => [...r]); next[rowIndex][c] = e.target.value;
          onChange(tables.map((table, i) => i === index ? { ...table, text: rowsToCsv(next) } : table));
        }} /></td>)}<td><Button type="button" variant="ghost" disabled={disabled} aria-label={`${t('bulk.removeRow')} ${rowIndex}`} onClick={() => onChange(tables.map((table, i) => i === index ? { ...table, text: rowsToCsv(rows.filter((_, r) => r !== rowIndex)) } : table))}>×</Button></td></tr>;
      })}</tbody>
    </table></div>
    <div className="flex items-center justify-between"><Button type="button" variant="outline" disabled={!pageIndex} onClick={() => setPage(pageIndex - 1)}>←</Button><span>{pageIndex + 1} / {Math.max(1, Math.ceil((rows.length - 1) / 20))} · {Math.max(0, rows.length - 1)} {t('bulk.rows')}</span><Button type="button" variant="outline" disabled={(pageIndex + 1) * 20 >= rows.length - 1} onClick={() => setPage(pageIndex + 1)}>→</Button></div>
  </div>;
}
