const fs = require('fs');
let s = fs.readFileSync('api/external.ts', 'utf-8');

const before = `      const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: config.fallbackValue } : { kgCo2ePerKm: config.fallbackValue }), activityId: null, dataVersion, source: "fallback", year: null, region: config.region, method: "fallback", fallback: true };
      return sendJson(res, 200, payload);`;

const after = `      let fallbackVal = config.fallbackValue;
      if (supabase && !cachedData) {
        // Encontrar CUALQUIER caché reciente de cualquier usuario para usarlo como fallback global en lugar del hardcodeado
        const { data: anyValidCache } = await supabase.from("climatiq_cache").select("*").eq("fuel_type", fuelType).not("kg_co2e_per_km", "is", null).order("cached_at", { ascending: false }).limit(1).maybeSingle();
        if (anyValidCache?.kg_co2e_per_km) {
          fallbackVal = Number(anyValidCache.kg_co2e_per_km);
        }
      }
      const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: fallbackVal } : { kgCo2ePerKm: fallbackVal }), activityId: null, dataVersion, source: "system_average_fallback", year: null, region: config.region, method: "fallback", fallback: true };
      return sendJson(res, 200, payload);`;

// Replace in both fallback logic blocks (the one missing apiKey, and the one rejecting empty payload)
s = s.replaceAll(before, after);
fs.writeFileSync('api/external.ts', s);