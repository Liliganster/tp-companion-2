import { z } from "zod";
import { loadEnv } from "vite";

const emptyToUndefined = (value) => {
  if (typeof value !== "string") return value;
  return value.trim() === "" ? undefined : value;
};

const optionalString = (schema) => z.preprocess(emptyToUndefined, schema.optional());

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),

  // AI workers (server-side)
  GEMINI_API_KEY: z.string().min(20),

  // Server-side Supabase admin access (Vercel functions)
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Optional but recommended (kept optional to avoid blocking deploys)
  SUPABASE_URL: optionalString(z.string().url()),
  CRON_SECRET: optionalString(z.string().min(16)),
  GOOGLE_MAPS_SERVER_KEY: optionalString(z.string().min(20)),
  ELECTRICITY_MAPS_API_KEY: optionalString(z.string().min(10)),
  ELECTRICITY_MAPS_DEFAULT_ZONE: optionalString(z.string().min(2)),
  UPSTASH_REDIS_REST_URL: optionalString(z.string().url()),
  UPSTASH_REDIS_REST_TOKEN: optionalString(z.string().min(10)),
  SENTRY_DSN: optionalString(z.string().url()),
  VITE_SENTRY_DSN: optionalString(z.string().url()),
  VITE_GA_MEASUREMENT_ID: optionalString(z.string().min(6)),
});

const mode = (process.argv[2] || "production").trim() || "production";
const loaded = loadEnv(mode, process.cwd(), "");
const env = { ...process.env, ...loaded };

const parsed = envSchema.safeParse(env);
if (parsed.success) {
  process.stdout.write(`[env] OK (mode=${mode})\n`);
  process.exit(0);
}

const details = parsed.error.issues
  .map((i) => `${i.path?.[0] ?? "env"}: ${i.message}`)
  .join("; ");

process.stderr.write(`[env] Missing/invalid required env vars. ${details}\n`);
process.exit(1);
