import { z } from "zod";
import { requireSupabaseUser, sendJson } from "../_utils/supabase.js";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";

const BodySchema = z.object({
  full_name: z.string().trim().max(500).nullable().optional(),
  vat_id: z.string().trim().max(100).nullable().optional(),
  license_plate: z.string().trim().max(50).nullable().optional(),
  language: z.enum(["es", "en", "de"]).nullable().optional(),
  rate_per_km: z.coerce.number().nullable().optional(),
  passenger_surcharge: z.coerce.number().nullable().optional(),
  base_address: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(200).nullable().optional(),
  country: z.string().trim().max(200).nullable().optional(),
  fuel_type: z.enum(["gasoline", "diesel", "ev", "unknown"]).nullable().optional(),
  fuel_l_per_100km: z.coerce.number().nullable().optional(),
  ev_kwh_per_100km: z.coerce.number().nullable().optional(),
  grid_kgco2_per_kwh: z.coerce.number().nullable().optional(),
  fuel_price_per_liter: z.coerce.number().nullable().optional(),
  electricity_price_per_kwh: z.coerce.number().nullable().optional(),
  maintenance_eur_per_km: z.coerce.number().nullable().optional(),
  other_eur_per_km: z.coerce.number().nullable().optional(),
});

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end();
    return;
  }

  const user = await requireSupabaseUser(req, res);
  if (!user) return;

  const parsed = BodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendJson(res, 400, { error: "invalid_body", details: parsed.error.issues });
  }

  const payload = {
    id: user.id,
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("user_profiles").upsert(payload, { onConflict: "id" });
  if (error) {
    console.error("[user/profile] upsert failed:", error);
    return sendJson(res, 500, { error: "upsert_failed", message: error.message });
  }

  return sendJson(res, 200, { ok: true });
}

