const fs = require('fs');
let s = fs.readFileSync('api/external.ts', 'utf-8');

const before = `    if (!attempt.ok || !data) {
      const msg = typeof data?.message === "string" ? data.message : typeof data?.error === "string" ? data.error : "";
      return sendJson(res, 502, { error: "climatiq_error", message: msg || "Failed to contact Climatiq", upstreamStatus: attempt.status, dataVersion, activityId: selection.activityId });
    }

    const co2e = Number(data?.co2e);
    const unit = typeof data?.co2e_unit === "string" ? data.co2e_unit : "kg";
    const co2eKg = Number.isFinite(co2e) ? co2eToKg(co2e, unit) : null;
    if (!Number.isFinite(co2e) || co2e <= 0 || co2eKg == null || !Number.isFinite(co2eKg) || co2eKg <= 0) return sendJson(res, 502, { error: "climatiq_error", message: "Invalid co2e payload" });`;

const after = `    if (!attempt.ok || !data || !Number.isFinite(Number(data?.co2e))) {
      console.warn("Climatiq API error, falling back", data);
      if (cachedData) {
        const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: Number(cachedData.kg_co2e_per_liter) } : { kgCo2ePerKm: Number(cachedData.kg_co2e_per_km) }), activityId: cachedData.activity_id, dataVersion: cachedData.data_version, source: "fallback_from_cache", year: cachedData.year, region: cachedData.region, method: "fallback", fallback: true };
        return sendJson(res, 200, payload);
      }
      const payload = { fuelType, ...(config.paramType === "volume" ? { kgCo2ePerLiter: config.fallbackValue } : { kgCo2ePerKm: config.fallbackValue }), activityId: null, dataVersion, source: "fallback", year: null, region: config.region, method: "fallback", fallback: true };
      return sendJson(res, 200, payload);
    }

    const co2e = Number(data?.co2e);
    const unit = typeof data?.co2e_unit === "string" ? data.co2e_unit : "kg";
    const co2eKg = Number.isFinite(co2e) ? co2eToKg(co2e, unit) : null;`;

s = s.replace(before, after);
fs.writeFileSync('api/external.ts', s);
