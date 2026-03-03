const fs = require('fs');
let s = fs.readFileSync('api/external.ts', 'utf-8');

const regex = /const payload = \{ fuelType, \.\.\.\(config\.paramType === "volume" \? \{ kgCo2ePerLiter: config\.fallbackValue \} : \{ kgCo2ePerKm: config\.fallbackValue \}\), activityId: null, dataVersion, source: "fallback", year: null, region: config\.region, method: "fallback", fallback: true \};\s*return sendJson\(res, 200, payload\);/g;

const replacement = `let finalFallback = config.fallbackValue;
      if (supabase) {
        const { data: userHistory } = await supabase.from('climatiq_cache').select('*').eq('user_id', user.id).eq('fuel_type', fuelType).order('cached_at', { ascending: false }).limit(1).maybeSingle();
        if (config.paramType === 'volume' && userHistory?.kg_co2e_per_liter) finalFallback = Number(userHistory.kg_co2e_per_liter);
        else if (config.paramType === 'distance' && userHistory?.kg_co2e_per_km) finalFallback = Number(userHistory.kg_co2e_per_km);
      }
      const payload = { fuelType, ...(config.paramType === 'volume' ? { kgCo2ePerLiter: finalFallback } : { kgCo2ePerKm: finalFallback }), activityId: null, dataVersion, source: 'historic_user_fallback', year: null, region: config.region, method: 'fallback', fallback: true };
      return sendJson(res, 200, payload);`;

s = s.replace(regex, replacement);
fs.writeFileSync('api/external.ts', s);
console.log('done via regex!');
