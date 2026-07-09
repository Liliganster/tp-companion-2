/**
 * Servidor API local para desarrollo — sustituye a `vercel dev`.
 *
 * Sirve las funciones reales de `api/` en http://localhost:3000 con el mismo
 * enrutado que vercel.json, y además hace de "cron" local: procesa la cola de
 * callsheets (api/worker.ts) cada pocos segundos, que en producción dispara
 * el cron de Vercel.
 *
 * Uso (con `VERCEL_DEV_API_ORIGIN=http://localhost:3000` en .env.local para
 * que Vite haga proxy de /api/*):
 *   npm run api:local     # terminal aparte de `npm run dev`
 */
import * as dotenv from "dotenv";
import { resolve } from "path";
import { createServer } from "http";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const PORT = Number(process.env.LOCAL_API_PORT || 3000);
const WORKER_POLL_MS = 8000;

// Enrutado equivalente a los rewrites de vercel.json (prefijo → módulo de api/).
const ROUTES: Array<[prefix: string, mod: string]> = [
  ["/api/google/", "../api/google.js"],
  ["/api/user/", "../api/user.js"],
  ["/api/callsheets/", "../api/callsheets.js"],
  ["/api/invoices/", "../api/invoices.js"],
  ["/api/expenses/", "../api/expenses.js"],
  ["/api/odometer/", "../api/odometer.js"],
  ["/api/climatiq/", "../api/external.js"],
  ["/api/electricity-maps/", "../api/external.js"],
  ["/api/worker", "../api/worker.js"],
];

const handlerCache = new Map<string, (req: any, res: any) => Promise<void>>();
async function loadHandler(mod: string) {
  if (!handlerCache.has(mod)) handlerCache.set(mod, (await import(mod)).default);
  return handlerCache.get(mod)!;
}

/** Adapta req/res de Node al estilo Vercel (query, body, status().json()). */
function adapt(req: any, res: any, url: URL) {
  req.query = Object.fromEntries(url.searchParams.entries());
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (obj: unknown) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (body: unknown) => {
    if (typeof body === "object" && body !== null) return res.json(body);
    res.end(body == null ? "" : String(body));
    return res;
  };
}

async function readBody(req: any): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf-8");
  const type = String(req.headers["content-type"] ?? "");
  if (type.includes("application/json")) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const route = ROUTES.find(([prefix]) => url.pathname === prefix.replace(/\/$/, "") || url.pathname.startsWith(prefix));
  if (!route) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found", path: url.pathname }));
    return;
  }
  try {
    (req as any).body = await readBody(req);
    adapt(req, res, url);
    const handler = await loadHandler(route[1]);
    await handler(req, res);
    if (!res.writableEnded) res.end();
  } catch (err: any) {
    console.error(`[local-api] ${req.method} ${url.pathname} →`, err?.message ?? err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "local_api_error", message: String(err?.message ?? err) }));
    }
  }
});

// "Cron" local: procesa la cola de callsheets periódicamente, como en producción.
let workerBusy = false;
async function pollWorker() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const handler = await loadHandler("../api/worker.js");
    let done: () => void;
    const finished = new Promise<void>((r) => { done = r; });
    let status = 200;
    const res: any = {
      setHeader: () => res,
      status: (c: number) => { status = c; return res; },
      json: (body: any) => {
        const processed = Array.isArray(body?.results) ? body.results.length : 0;
        if (processed > 0) console.log(`[worker] ${processed} job(s) procesados (HTTP ${status})`);
        else if (status >= 400) console.warn(`[worker] HTTP ${status}:`, JSON.stringify(body));
        done();
        return res;
      },
      end: () => { done(); return res; },
    };
    await handler(
      {
        method: "POST",
        url: "/api/worker",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
        query: {},
        body: {},
      },
      res,
    );
    await finished;
  } catch (err: any) {
    console.error("[worker] error:", err?.message ?? err);
  } finally {
    workerBusy = false;
  }
}

server.listen(PORT, () => {
  console.log(`\n🟢 API local en http://localhost:${PORT} (rutas /api/* reales de api/)`);
  console.log(`   Worker de callsheets: cada ${WORKER_POLL_MS / 1000}s`);
  console.log(`   Vite debe tener VERCEL_DEV_API_ORIGIN=http://localhost:${PORT} en .env.local\n`);
  setInterval(pollWorker, WORKER_POLL_MS);
  void pollWorker();
});
