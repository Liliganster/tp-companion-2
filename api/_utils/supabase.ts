const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type SupabaseUser = {
  id: string;
  email?: string;
};

function json(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export function getBearerToken(req: any) {
  const raw = req.headers?.authorization ?? req.headers?.Authorization;
  if (typeof raw !== "string") return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export async function requireSupabaseUser(req: any, res: any): Promise<SupabaseUser | null> {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    json(res, 500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    return null;
  }

  const token = getBearerToken(req);
  if (!token) {
    json(res, 401, { error: "Missing Authorization header" });
    return null;
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SERVICE_ROLE,
    },
  });

  if (!response.ok) {
    json(res, 401, { error: "Invalid session" });
    return null;
  }

  const data: any = await response.json().catch(() => null);
  if (!data?.id) {
    json(res, 401, { error: "Invalid session" });
    return null;
  }

  return { id: String(data.id), email: data.email ? String(data.email) : undefined };
}

export async function supabaseUpsertGoogleConnection(params: {
  userId: string;
  providerAccountEmail?: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: string;
  scopes: string;
}) {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const response = await fetch(`${SUPABASE_URL}/rest/v1/google_connections?on_conflict=user_id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([
      {
        user_id: params.userId,
        provider: "google",
        provider_account_email: params.providerAccountEmail ?? null,
        refresh_token: params.refreshToken ?? null,
        access_token: params.accessToken ?? null,
        expires_at: params.expiresAt ?? null,
        scopes: params.scopes,
        updated_at: new Date().toISOString(),
      },
    ]),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase upsert failed: ${response.status} ${text}`);
  }

  const data = await response.json().catch(() => null);
  return data;
}

export async function supabaseGetGoogleConnection(userId: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const url = new URL(`${SUPABASE_URL}/rest/v1/google_connections`);
  url.searchParams.set("select", "user_id,provider_account_email,refresh_token,access_token,expires_at,scopes");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("provider", "eq.google");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase query failed: ${response.status} ${text}`);
  }

  const data: any[] = (await response.json().catch(() => [])) as any[];
  return data?.[0] ?? null;
}

export async function supabaseDeleteGoogleConnection(userId: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const url = new URL(`${SUPABASE_URL}/rest/v1/google_connections`);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("provider", "eq.google");

  const response = await fetch(url.toString(), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase delete failed: ${response.status} ${text}`);
  }
}

export function sendJson(res: any, status: number, payload: unknown) {
  json(res, status, payload);
}

