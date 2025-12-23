type AnyErr = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
  statusCode?: number;
};

function getMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  const anyErr = err as AnyErr;
  return anyErr.message || String(err);
}

function includesAny(haystack: string, needles: string[]) {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

export function formatSupabaseError(err: unknown, fallback: string): string {
  const msg = getMessage(err);
  const code = (err as AnyErr)?.code;

  // Missing schema / migrations not applied
  if (code === "42P01" || /relation .* does not exist/i.test(msg)) {
    return "Tu proyecto de Supabase parece no tener las tablas/migraciones aplicadas. Revisa y ejecuta las migraciones en Supabase antes de continuar.";
  }

  // RLS / permissions
  if (
    code === "42501" ||
    includesAny(msg, [
      "row-level security",
      "rls",
      "permission denied",
      "new row violates row-level security",
      "not allowed",
      "insufficient_privilege",
    ])
  ) {
    return "Supabase rechazó la operación por permisos (RLS). Revisa las políticas de RLS para tu usuario autenticado.";
  }

  // Storage bucket missing / storage misconfig
  if (includesAny(msg, ["bucket", "not found", "storage"])
      && includesAny(msg, ["callsheets", "bucket"])) {
    return "No se encontró el bucket 'callsheets' o no tienes permisos. Crea el bucket y aplica las políticas de storage en Supabase.";
  }

  // Generic
  return msg ? `${fallback}: ${msg}` : fallback;
}
