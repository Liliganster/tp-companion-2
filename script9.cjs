const fs = require('fs');
let s = fs.readFileSync('api/external.ts', 'utf-8');

const debugBlock = `      const payload: any = { fuelType, ...(config.paramType === 'volume' ? { kgCo2ePerLiter: finalFallback } : { kgCo2ePerKm: finalFallback }), activityId: null, dataVersion, source: 'historic_user_fallback', year: null, region: config.region, method: 'fallback', fallback: true };
      if (typeof attempt !== "undefined") {
        payload._debug = {
          status: attempt.status,
          rawText: attempt.rawText,
          message: "API called but failed or returned invalid data"
        };
      } else {
        payload._debug = "No attempt made. Possibly missing API key.";
      }
      return sendJson(res, 200, payload);`;

const clean = `      const payload = { fuelType, ...(config.paramType === 'volume' ? { kgCo2ePerLiter: finalFallback } : { kgCo2ePerKm: finalFallback }), activityId: null, dataVersion, source: 'historic_user_fallback', year: null, region: config.region, method: 'fallback', fallback: true };
      return sendJson(res, 200, payload);`;

s = s.replaceAll(debugBlock, clean);
fs.writeFileSync('api/external.ts', s);
console.log('debug removed, occurrences left:', (s.match(/_debug/g)||[]).length);
