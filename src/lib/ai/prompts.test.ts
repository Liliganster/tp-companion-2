import { describe, expect, it } from "vitest";

import { buildUniversalExtractorPrompt } from "./prompts";
import { extractionSchema } from './schema';
import { CallsheetExtractionResultSchema } from './validation';
import { classifyLabeledLocations } from '../../../api/_utils/callsheetLabels';

describe("buildUniversalExtractorPrompt", () => {
  it('anchors every location to the first-page shooting date while reading all pages', () => {
    const prompt = buildUniversalExtractorPrompt('');
    expect(prompt).toContain('main shooting date printed on the FIRST PAGE');
    expect(prompt).toContain('Read ALL pages');
    expect(prompt).toContain('A location need not repeat that date');
    expect(extractionSchema.properties.date.description).toContain('FIRST PAGE');
    expect(extractionSchema.properties.locations.items.properties.dayScope.description).toContain('FIRST PAGE');
  });
  it('keeps separately identified logistics available for exclusion without enumerating every address', () => {
    const prompt = buildUniversalExtractorPrompt('[PDF ATTACHED]');
    expect(prompt).toContain('including separately identified logistics for exclusion');
    expect(extractionSchema.properties.locations.description).toContain('separate logistics for exclusion');
    expect(prompt).toContain('not used as filming destinations');
    expect(prompt).not.toContain('SKIP its address completely');
    expect(prompt).not.toContain('NEVER include addresses from these sections');
    expect(prompt).not.toContain('If no filming location found');
  });

  it('preserves multiple filming destinations and stores logistics separately, including a shared address', () => {
    const parsed = CallsheetExtractionResultSchema.parse({
      date: '2026-09-09', projectName: 'Synthetic production', productionCompanies: [],
      locations: [
        { label: 'MOTIV 1', address: 'Example Street 10, City' },
        { label: 'CATERING', address: 'Example Street 10, City' },
        { label: 'SET 2', address: 'Other Street 20, City' },
        { label: 'PARKEN', address: 'Third Street 30, City' },
        { label: 'BASIS', address: 'Fourth Street 40, City' },
      ],
    });
    const classified = classifyLabeledLocations(parsed.locations.map(location => ({
      label: location.label ?? '', address: location.address ?? '',
    })));
    expect(classified.filming.map(l => l.label)).toEqual(['MOTIV 1', 'SET 2']);
    expect(classified.dropped.map(l => l.label)).toEqual(['CATERING', 'PARKEN', 'BASIS']);
    expect(classified.dropped[0].address).toBe('Example Street 10, City');
  });
  it("analyzes the full document while excluding future-day, appendix and contact sections", () => {
    const prompt = buildUniversalExtractorPrompt("[PDF ATTACHED]");

    expect(prompt).toContain("Read ALL pages");
    expect(prompt).toContain("Explicit other-day blocks remain separate");
    expect(prompt).toContain("Logistics are not used as filming destinations");
    expect(prompt).toContain("schedule, movements and maps together");
    expect(prompt).not.toContain("Only analyze the FIRST 2 PAGES");
  });
});

it('shares the filming-unit contract between prompt and schema', () => {
  expect(extractionSchema.properties.documentUnit.enum).toContain('mixed');
  expect(buildUniversalExtractorPrompt('')).toContain('governing document header');
  expect(extractionSchema.properties.locations.items.required).toContain('unitScope');
  expect(extractionSchema.properties.locations.items.required).not.toContain('unitEvidence');
  expect(buildUniversalExtractorPrompt('')).toContain('absence of a unit label is not a reason to reject it');
});
