const fs = require('fs');
let s = fs.readFileSync('api/invoice-worker.ts', 'utf-8');

const before = `            const { data: userProfile } = await supabaseAdmin
              .from("user_profiles")
              .select("openrouter_enabled, openrouter_api_key, openrouter_model")
              .eq("id", userId)
              .maybeSingle();

            if (userProfile?.openrouter_enabled && userProfile?.openrouter_api_key) {`;

const after = `            const { data: userProfile } = await supabaseAdmin
              .from("user_profiles")
              .select("openrouter_enabled, openrouter_api_key, openrouter_model, plan_tier")
              .eq("id", userId)
              .maybeSingle();

            if (userProfile?.plan_tier === "pro" && userProfile?.openrouter_enabled && userProfile?.openrouter_api_key) {`;

s = s.replace(before, after);
fs.writeFileSync('api/invoice-worker.ts', s);
