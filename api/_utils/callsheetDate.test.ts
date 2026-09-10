import { expect, it } from 'vitest';
import { resolveCallsheetDate } from './callsheetDate';
it('keeps the documented date regardless of upload year', () => {
  for (const referenceIso of ['2000-01-01','2026-09-10','2040-01-01'])
    expect(resolveCallsheetDate({date:'2024-05-06',dateRaw:'Montag 06.05.2024',referenceIso})).toBe('2024-05-06');
});
it.each(['Tuesday 19th Nov','15th Jan','14.07.','29th Feb'])('never supplies a missing year: %s', dateRaw => {
  expect(resolveCallsheetDate({date:'2024-11-19',dateRaw,dateYearInDocument:false,referenceIso:'2026-09-10'})).toBe('');
});
it.each(['2023-02-29','2024-02-30','not a date',''])('rejects invalid dates: %s', date => {
  expect(resolveCallsheetDate({date,dateYearInDocument:true})).toBe('');
});
it('requires resolution of conflicting printed years', () => {
  expect(resolveCallsheetDate({date:'2026-05-06',dateRaw:'06.05.2024',dateYearInDocument:true})).toBe('');
});
