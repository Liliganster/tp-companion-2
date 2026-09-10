import { expect, it } from 'vitest';
import { CallsheetExtractionResultSchema } from './validation';
const valid = { date: '2026-09-10', projectName: 'Film', locations: [{ label: 'MOTIV', address: 'Example Street 10' }] };
it.each(['', '   ', null, undefined])('does not discard locations for empty descriptive metadata: %s', value => {
  const result = CallsheetExtractionResultSchema.parse({ ...valid, projectName: value, productionCompanies: [null, '', ' ', 'Studio'] });
  expect(result.projectName).toBe('Untitled Project');
  expect(result.productionCompanies).toEqual(['Studio']);
  expect(result.locations).toHaveLength(1);
});
it('preserves multiple locations and actual project metadata', () => {
  const result = CallsheetExtractionResultSchema.parse({ ...valid, productionCompanies: null, locations: [...valid.locations, { label: 'SET', address: 'Other Street 20' }] });
  expect(result.projectName).toBe('Film');
  expect(result.locations).toHaveLength(2);
  expect(result.productionCompanies).toEqual([]);
});
it('preserves an empty address for contextual review without rejecting valid locations', () => {
  const result = CallsheetExtractionResultSchema.parse({ ...valid, locations: [...valid.locations, { label: 'SET', address: '' }] });
  expect(result.locations).toHaveLength(2);
});
it('preserves all locations even when the date needs separate interpretation', () => {
  expect(CallsheetExtractionResultSchema.parse({ ...valid, date: '' }).date).toBe('');
  const result = CallsheetExtractionResultSchema.safeParse({ ...valid, date: 'not a date' });
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.locations).toHaveLength(1);
});
