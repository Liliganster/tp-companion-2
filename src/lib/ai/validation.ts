import { z } from "zod";

const LabeledLocationSchema = z.union([
  z.object({
    label: z.string().trim().max(120).catch("").default(""),
    address: z.string().trim().max(300).nullish().transform(value => value ?? ''),
    normalizedAddress: z.string().trim().max(300).optional().catch(''),
    locationKind: z.enum(['physical_destination', 'internal_marker', 'mobile_scene', 'uncertain']).optional().catch('uncertain'),
    addressRelation: z.enum(['set_address', 'access_only', 'unresolved']).optional().catch('unresolved'),
    siteEvidence: z.string().trim().transform(value => value.slice(0, 1200)).catch('').default(''),
    role: z.enum(['filming', 'logistics', 'other', 'uncertain']).optional().catch('uncertain'),
    reviewReason: z.string().trim().transform(value => value.slice(0, 1000)).catch('').default(''),
    unitScope: z.enum(['main_unit', 'other_unit', 'unspecified', 'uncertain']).catch('uncertain').default('unspecified'),
    unitEvidence: z.string().trim().max(3000).catch('').default(''),
    dayScope: z.enum(['document_day', 'other_day', 'uncertain']).catch('uncertain').default('document_day'),
    dayDate: z.string().trim().max(160).catch('').default(''),
    dayEvidence: z.string().trim().max(3000).catch('').default(''),
    // Dirección geocodificable (errata corregida); el address queda como evidencia.
    addressCorrected: z.string().trim().max(300).catch("").default(""),
  }),
  // Compatibilidad: si el modelo devuelve strings sueltos, se convierten.
  z.string().trim().min(1).max(300).transform((address) => ({ label: "", address, addressCorrected: "" })),
]);

export type LabeledLocation = { label: string; address: string; addressCorrected?: string; role?: 'filming' | 'logistics' | 'other' | 'uncertain'; reviewReason?: string };

export const CallsheetExtractionResultSchema = z.object({
  documentUnit: z.enum(['main_unit', 'other_unit', 'mixed', 'unspecified', 'uncertain']).catch('uncertain').default('unspecified'),
  // Legacy or malformed scope stays conservative; do not guess from free text
  // in one language whether a review reason is merely descriptive metadata.
  documentReviewScope: z.enum(['none', 'metadata', 'date', 'unit', 'locations', 'unknown']).catch('unknown').default('unknown'),
  documentReviewReason: z.string().trim().transform(value => value.slice(0, 1000)).catch('').default(''),
  // A readable non-ISO date must not discard locations or the whole document.
  date: z.string().trim().max(160).nullish().catch('').transform(value => value ?? ''),
  dateRaw: z.string().trim().max(300).nullable().optional().catch(''),
  dateYearInDocument: z.boolean().nullable().optional().catch(null),
  // Descriptive metadata must not discard otherwise supported locations.
  // Keep the same explicit fallback requested by the extraction prompt.
  projectName: z.string().trim().max(160).nullish().transform(value => value || 'Untitled Project'),
  productionCompanies: z.array(z.string().trim().max(160).nullable())
    .nullish().transform(values => (values ?? []).filter((value): value is string => Boolean(value))),
  locations: z.array(LabeledLocationSchema.catch({
    label: '', address: '', normalizedAddress: '', role: 'uncertain',
    reviewReason: 'La IA devolvió un bloque de locación ilegible; comprueba este bloque en el documento.',
  })),
});

export type CallsheetExtractionResult = z.infer<typeof CallsheetExtractionResultSchema>;

export function describeCallsheetValidationError(error: z.ZodError): string {
  const fields = error.issues.map(issue => {
    const [field, index] = issue.path;
    if (field === 'date') return 'fecha de rodaje';
    if (field === 'locations') return typeof index === 'number' ? `locación ${index + 1} (dirección o datos incompletos)` : 'locaciones';
    if (field === 'projectName') return 'nombre del proyecto';
    if (field === 'productionCompanies') return 'productora';
    return 'datos del documento';
  });
  return `La IA devolvió datos vacíos o con un formato no válido: ${[...new Set(fields)].join(', ')}. Revisa el documento original y completa o corrige esos datos manualmente.`;
}
