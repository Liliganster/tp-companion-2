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

it.each([
 ['Montag, 6. Mai 2024','2024-05-06'],
 ['martes, 19 de noviembre de 2024','2024-11-19'],
 ['19th November 2024','2024-11-19'],
 ['November 19, 2024','2024-11-19'],
 ['vendredi 21 août 2026','2026-08-21'],
 ['21 settembre 2026','2026-09-21'],
 ['19 listopada 2024','2024-11-19'],
 ['19. listopadu 2024','2024-11-19'],
 ['19 ноября 2024','2024-11-19'],
 ['2024年11月19日','2024-11-19'],
 ['19/11/2024','2024-11-19'],
 ['11/19/2024','2024-11-19'],
])('reads multilingual printed date %s without requiring ISO output', (dateRaw,expected)=>{
 expect(resolveCallsheetDate({date:dateRaw,dateRaw})).toBe(expected);
 expect(resolveCallsheetDate({date:'',dateRaw})).toBe(expected);
});
it('uses the contextual ISO interpretation to disambiguate numeric order',()=>{
 expect(resolveCallsheetDate({date:'2024-04-03',dateRaw:'03/04/2024'})).toBe('2024-04-03');
 expect(resolveCallsheetDate({date:'',dateRaw:'03/04/2024'})).toBe('');
});
it('accepts an explicit short year when it agrees with the contextual full year',()=>{
 expect(resolveCallsheetDate({date:'2024-11-19',dateRaw:'19.11.24',dateYearInDocument:false})).toBe('2024-11-19');
 expect(resolveCallsheetDate({date:'2026-11-19',dateRaw:'19.11.24',dateYearInDocument:false})).toBe('');
});
