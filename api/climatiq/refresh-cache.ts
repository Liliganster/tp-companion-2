/**
 * POST /api/climatiq/refresh-cache
 * 
 * Force refresh the Climatiq cache for a specific fuel type.
 * Called when user changes their vehicle settings (fuel type, region, etc).
 * 
 * This ensures we don't call the API every time, but only when settings change.
 */

import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization" });
  }

  const token = authHeader.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Missing Supabase configuration" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Verify the user token
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { fuelType } = req.body;
  if (!fuelType || !["gasoline", "diesel", "ev"].includes(fuelType)) {
    return res.status(400).json({ error: "Invalid or missing fuelType" });
  }

  try {
    // Delete the old cache entry to force a refresh on next fetch
    const { error: deleteError } = await supabase
      .from("climatiq_cache")
      .delete()
      .eq("user_id", user.id)
      .eq("fuel_type", fuelType);

    if (deleteError) {
      console.error("[refresh-cache] Delete error:", deleteError);
      return res.status(500).json({ error: "Failed to clear cache" });
    }

    return res.status(200).json({ 
      success: true, 
      message: `Cache cleared for ${fuelType}. Will be refreshed on next query.` 
    });
  } catch (error) {
    console.error("[refresh-cache] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
