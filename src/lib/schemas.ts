import { z } from "zod";

export const dateIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const TripInputSchema = z.object({
  id: z.string().min(1),
  date: dateIsoSchema,
  distance: z.number().finite().positive().max(10_000),
  passengers: z.number().int().min(0).max(99).optional(),
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

