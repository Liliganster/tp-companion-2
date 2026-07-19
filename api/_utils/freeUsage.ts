import { createHmac } from "node:crypto";
import { supabaseAdmin } from "../../src/lib/supabaseServer.js";

const identityCache = new Map<string, { value: string; expiresAt: number }>();

function isMissingFreeLedger(error: any): boolean {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST202" || code === "PGRST205" || message.includes("free_ai_usage");
}

function currentPeriodStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function getFreeIdentityHash(userId: string): Promise<string | null> {
  const cached = identityCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  const user = data?.user;
  if (error || !user) return null;

  // Para Google usamos el identificador estable de esa cuenta. Si el usuario
  // borra y recrea su cuenta de la app, el mismo Google `sub` conserva la cuota.
  const googleIdentity = user.identities?.find((identity) => identity.provider === "google") as any;
  const googleSubject = typeof googleIdentity?.identity_data?.sub === "string"
    ? googleIdentity.identity_data.sub.trim()
    : "";
  const email = user.email?.trim().toLowerCase() ?? "";
  const identity = googleSubject ? `google:${googleSubject}` : email ? `email:${email}` : "";
  if (!identity) return null;

  // La clave nunca sale del servidor. FREE_ACCESS_PEPPER permite rotación
  // independiente; service_role es un fallback seguro mientras se configura.
  const secret = process.env.FREE_ACCESS_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  const value = createHmac("sha256", secret).update(`free:${identity}`).digest("hex");
  identityCache.set(userId, { value, expiresAt: Date.now() + 15 * 60_000 });
  return value;
}

export async function getFreeAiUsage(userId: string): Promise<number | null> {
  const identityHash = await getFreeIdentityHash(userId);
  if (!identityHash) return null;
  const { data, error } = await supabaseAdmin
    .from("free_ai_usage_ledger")
    .select("used_count")
    .eq("identity_hash", identityHash)
    .eq("period_start", currentPeriodStart())
    .eq("kind", "callsheet")
    .maybeSingle();
  if (error) {
    if (!isMissingFreeLedger(error)) console.error("[free-usage] lookup failed", error.message);
    return null;
  }
  return typeof (data as any)?.used_count === "number" ? (data as any).used_count : 0;
}

export async function incrementFreeAiUsage(userId: string): Promise<void> {
  const identityHash = await getFreeIdentityHash(userId);
  if (!identityHash) return;
  const { error } = await supabaseAdmin.rpc("increment_free_ai_usage", {
    p_identity_hash: identityHash,
    p_period_start: currentPeriodStart(),
    p_kind: "callsheet",
  });
  if (error && !isMissingFreeLedger(error)) throw error;
}
