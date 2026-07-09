import { z } from "zod";

export const dateIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const TripInputSchema = z.object({
  id: z.string().min(1),
  date: dateIsoSchema,
  distance: z.number().finite().min(0).max(10_000),
  passengers: z.number().int().min(0).max(99).optional(),
  fuelLiters: z.number().finite().min(0).max(10_000).optional(),
  evKwhUsed: z.number().finite().min(0).max(10_000).optional(),
  purpose: z.string().max(500).optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export const ProjectInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  ratePerKm: z.number().finite().min(0).max(100).optional(),
});

export const ReportInputSchema = z.object({
  startDate: dateIsoSchema,
  endDate: dateIsoSchema,
  totalDistanceKm: z.number().finite().min(0).max(10_000_000),
  tripsCount: z.number().int().min(0).max(10_000_000),
});

// ── Filas de Supabase (Fase 5: sin `any` en el núcleo de datos) ──────────────
// Tipos estructurales de lo que devuelve PostgREST; los campos numéricos
// pueden llegar como string (columnas numeric), por eso number | string.

/** Elemento del jsonb `documents` de trips (incluye la pseudo-doc "client_meta"). */
export type TripDocumentRow = {
  id?: string;
  name?: string;
  kind?: string;
  mimeType?: string;
  storagePath?: string;
  /** Legado: rutas antiguas guardadas como `path`. */
  path?: string;
  bucketId?: string;
  driveFileId?: string;
  extractedAmount?: number | null;
  createdAt?: string;
};

/** Fila de `trips` tal como la devuelve `select("*, projects(name)")`. */
export type TripRow = {
  id: string;
  trip_date?: string | null;
  date_value?: string | null;
  route?: string[] | null;
  project_id?: string | null;
  projects?: { name?: string | null } | null;
  callsheet_job_id?: string | null;
  purpose?: string | null;
  passengers?: number | null;
  invoice_number?: string | null;
  distance_km?: number | string | null;
  co2_kg?: number | string | null;
  rate_per_km_override?: number | null;
  special_origin?: "base" | "continue" | "return" | null;
  toll_amount?: number | null;
  parking_amount?: number | null;
  other_expenses?: number | null;
  fuel_amount?: number | null;
  fuel_liters?: number | string | null;
  ev_kwh_used?: number | string | null;
  documents?: TripDocumentRow[] | null;
};
