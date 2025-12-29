import { z } from "zod";

const clientEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
});

function formatZodIssues(e: z.ZodError) {
  return e.issues
    .map((i) => {
      const key = i.path?.[0] ? String(i.path[0]) : "env";
      return `${key}: ${i.message}`;
    })
    .join("; ");
}

export function assertClientEnv() {
  const parsed = clientEnvSchema.safeParse(import.meta.env);
  if (parsed.success) return parsed.data;

  const details = formatZodIssues(parsed.error);
  const msg = `Missing/invalid required client env vars. ${details}`;

  // In production we want to fail fast to avoid a half-configured deploy.
  if (import.meta.env.PROD) throw new Error(msg);

  // In dev we warn so the app can still load in "offline" mode.
  console.warn(msg);
  return null;
}

