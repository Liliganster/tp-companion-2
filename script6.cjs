const fs = require('fs');
let s = fs.readFileSync('api/external.ts', 'utf-8');

const originalCatchAll = `    if (!attempt.ok || !data || !Number.isFinite(co2e) || co2e <= 0 || co2eKg == null || !Number.isFinite(co2eKg) || co2eKg <= 0) {
      if (cachedData) {
        const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: Number(cachedData.kg_co2e_per_liter) } : { kgCo2ePerKm: Number(cachedData.kg_co2e_per_km) }), activityId: cachedData.activity_id, dataVersion: cachedData.data_version, source: "fallback_from_cache", year: cachedData.year, region: cachedData.region, method: "fallback", fallback: true };
        return sendJson(res, 200, payload);
      }
      const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: config.fallbackValue } : { kgCo2ePerKm: config.fallbackValue }), activityId: null, dataVersion, source: "fallback", year: null, region: config.region, method: "fallback", fallback: true };
      return sendJson(res, 200, payload);
    }`;

const newCatchAll = `    if (!attempt.ok || !data || !Number.isFinite(co2e) || co2e <= 0 || co2eKg == null || !Number.isFinite(co2eKg) || co2eKg <= 0) {
      if (cachedData) {
        const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: Number(cachedData.kg_co2e_per_liter) } : { kgCo2ePerKm: Number(cachedData.kg_co2e_per_km) }), activityId: cachedData.activity_id, dataVersion: cachedData.data_version, source: "fallback_from_cache", year: cachedData.year, region: cachedData.region, method: "fallback", fallback: true };
        return sendJson(res, 200, payload);
      }
      
      let finalFallback = config.fallbackValue;
      if (supabase) {
        // Fallback dinámico automático, 100% privado (filtrando por user.id)
        const { data: userHistory } = await supabase.from("climatiq_cache")
          .select("*")
          .eq("user_id", user.id)
          .eq("fuel_type", fuelType)
          .order("cached_at", { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (config.paramType === "volume" && userHistory?.kg_co2e_per_liter) {
          finalFallback = Number(userHistory.kg_co2e_per_liter);
        } else if (config.paramType === "distance" && userHistory?.kg_co2e_per_km) {
          finalFallback = Number(userHistory.kg_co2e_per_km);
        }
      }
      
      const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: finalFallback } : { kgCo2ePerKm: finalFallback }), activityId: null, dataVersion, source: "historic_user_fallback", year: null, region: config.region, method: "fallback", fallback: true };
      return sendJson(res, 200, payload);
    }`;


const originalMissingApiKey = `    const apiKey = (process.env.CLIMATIQ_API_KEY || "").trim();
    if (!apiKey) {
      if (cachedData) {
        const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: Number(cachedData.kg_co2e_per_liter) } : { kgCo2ePerKm: Number(cachedData.kg_co2e_per_km) }), activityId: cachedData.activity_id, dataVersion: cachedData.data_version, source: "fallback_from_cache", year: cachedData.year, region: cachedData.region, method: "fallback", fallback: true };
        return sendJson(res, 200, payload);
      }
      const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: config.fallbackValue } : { kgCo2ePerKm: config.fallbackValue }), activityId: null, dataVersion, source: "fallback", year: null, region: config.region, method: "fallback", fallback: true };
      return sendJson(res, 200, payload);
    }`;

const newMissingApiKey = `    const apiKey = (process.env.CLIMATIQ_API_KEY || "").trim();
    if (!apiKey) {
      if (cachedData) {
        const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: Number(cachedData.kg_co2e_per_liter) } : { kgCo2ePerKm: Number(cachedData.kg_co2e_per_km) }), activityId: cachedData.activity_id, dataVersion: cachedData.data_version, source: "fallback_from_cache", year: cachedData.year, region: cachedData.region, method: "fallback", fallback: true };
        return sendJson(res, 200, payload);
      }
      
      let finalFallback = config.fallbackValue;
      if (supabase) {
        const { data: userHistory } = await supabase.from("climatiq_cache")
          .select("*")
          .eq("user_id", user.id)
          .eq("fuel_type", fuelType)
          .order("cached_at", { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (config.paramType === "volume" && userHistory?.kg_co2e_per_liter) {
          finalFallback = Number(userHistory.kg_co2e_per_liter);
        } else if (config.paramType === "distance" && userHistory?.kg_co2e_per_km) {
          finalFallback = Number(userHistory.kg_co2e_per_km);
        }
      }
      
      const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: finalFallback } : { kgCo2ePerKm: finalFallback }), activityId: null, dataVersion, source: "historic_user_fallback", year: null, region: config.region, method: "fallback", fallback: true };
      return sendJson(res, 200, payload);
    }`;

s = s.replace(originalCatchAll, newCatchAll);
s = s.replace(originalMissingApiKey, newMissingApiKey);

fs.writeFileSync('api/external.ts', s);
console.log('Done replacement');
