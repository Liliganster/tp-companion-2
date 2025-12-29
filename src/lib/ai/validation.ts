import { z } from "zod";

const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const InvoiceExtractionResultSchema = z.object({
  totalAmount: z.preprocess((v) => {
    if (typeof v === "string") {
      const normalized = v.trim().replace(/\s+/g, "").replace(",", ".");
      return normalized ? Number(normalized) : v;
    }
    return v;
  }, z.number().finite().min(0).max(10_000_000)),
  currency: z
    .preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v), z.string().min(3).max(8))
    .optional()
    .default("EUR"),
  invoiceNumber: z.string().trim().min(1).max(64).nullable().optional(),
  invoiceDate: dateIso.nullable().optional(),
  vendorName: z.string().trim().min(1).max(120).nullable().optional(),
  purpose: z.string().trim().min(1).max(120).nullable().optional(),
});

export type InvoiceExtractionResult = z.infer<typeof InvoiceExtractionResultSchema>;

export const CallsheetExtractionResultSchema = z.object({
  date: dateIso,
  projectName: z.string().trim().min(1).max(160),
  productionCompanies: z.array(z.string().trim().min(1).max(160)).default([]),
  locations: z.array(z.string().trim().min(1).max(300)).min(1),
});

export type CallsheetExtractionResult = z.infer<typeof CallsheetExtractionResultSchema>;

