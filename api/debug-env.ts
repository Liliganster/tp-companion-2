import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const envVars = [
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_PRO",
    "VITE_STRIPE_PRICE_PRO",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VERCEL_URL",
    "VITE_APP_URL"
  ];

  const status: Record<string, string> = {};
  
  envVars.forEach(key => {
    const val = process.env[key];
    if (!val) {
      status[key] = "MISSING";
    } else {
      status[key] = `PRESENT (len=${val.length})`;
      if (key === "STRIPE_SECRET_KEY" && val.includes("\n")) {
         status[key] += " [CONTAINS NEWLINES]";
      }
    }
  });

  res.status(200).json({ 
    status: "ok", 
    env_check: status,
    node_env: process.env.NODE_ENV 
  });
}
