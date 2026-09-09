import { z } from "zod";

const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const LabeledLocationSchema = z.union([
  z.object({
    label: z.string().trim().max(120).catch("").default(""),
    address: z.string().trim().min(1).max(300),
    dayScope: z.enum(['document_day', 'other_day', 'uncertain']).catch('uncertain').default('uncertain'),
    dayDate: z.string().trim().max(10).catch('').default(''),
    dayEvidence: z.string().trim().max(3000).catch('').default(''),
    // Dirección geocodificable (errata corregida); el address queda como evidencia.
    addressCorrected: z.string().trim().max(300).catch("").default(""),
  }),
  // Compatibilidad: si el modelo devuelve strings sueltos, se convierten.
  z.string().trim().min(1).max(300).transform((address) => ({ label: "", address, addressCorrected: "" })),
]);

export type LabeledLocation = { label: string; address: string; addressCorrected?: string };

export const CallsheetExtractionResultSchema = z.object({
  date: dateIso,
  dateRaw: z.string().trim().max(120).nullable().optional(),
  dateYearInDocument: z.boolean().nullable().optional(),
  projectName: z.string().trim().min(1).max(160),
  productionCompanies: z.array(z.string().trim().min(1).max(160)).default([]),
  locations: z.array(LabeledLocationSchema).min(1),
});

export type CallsheetExtractionResult = z.infer<typeof CallsheetExtractionResultSchema>;
