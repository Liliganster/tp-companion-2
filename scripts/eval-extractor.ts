/**
 * Eval del extractor de callsheets — Fase 2 del PLAN.md.
 *
 * Mide el pipeline REAL (api/worker.ts: Gemini + filtros + parsing) contra las
 * anotaciones a mano de docs/eval/*.yaml. Nada se fusiona sin pasar por aquí.
 *
 * Uso:
 *   npm run eval:extractor              # corre todas las anotaciones
 *   npm run eval:extractor -- --geocode # incluye geocoding (gasta Google Maps)
 *   npm run eval:extractor -- --keep    # no borra jobs/archivos al terminar (para inspeccionar)
 *   npm run eval:extractor -- --only FUNDBOX  # solo callsheets cuyo nombre contenga "FUNDBOX"
 *
 * Requiere en .env.local: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * GEMINI_API_KEY, CRON_SECRET. Cada callsheet evaluada = 1 llamada a Gemini.
 */
import * as dotenv from "dotenv";
import { resolve, join, basename } from "path";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { parse as parseYaml } from "yaml";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
// El eval no debe consumir la cuota mensual de la usuaria ni bloquearse por ella.
process.env.BYPASS_AI_LIMITS = "1";
// Sin rate limiting en el eval (y unas credenciales muertas no deben tumbarlo).
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const EVAL_DIR = resolve(process.cwd(), "docs/eval");
const PDF_DIR = join(EVAL_DIR, "callsheets");
const RESULTS_DIR = join(EVAL_DIR, "results");
const EVAL_USER_EMAIL = "eval-extractor@fahrtenbuchpro.local";

const args = process.argv.slice(2);
const KEEP = args.includes("--keep");
const GEOCODE = args.includes("--geocode");
const ONLY = (() => {
  const i = args.indexOf("--only");
  return i >= 0 ? String(args[i + 1] ?? "").toLowerCase() : null;
})();

type Annotation = {
  archivo: string;
  fecha?: string;
  proyecto?: string;
  productora?: string;
  localizaciones?: Array<{ etiqueta?: string; direccion?: string; enlace_maps?: string }>;
  excluidas?: string[];
  notas?: string;
};

type PredictedLocation = { name_raw: string | null; address_raw: string | null; formatted_address: string | null };

// ── Normalización y matching ─────────────────────────────────────────────────

function normalize(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin diacríticos
    .replace(/straße|strasse/g, "str")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: string | null | undefined): Set<string> {
  return new Set(normalize(s).split(" ").filter((w) => w.length > 1));
}

/** Solape de tokens (Jaccard sobre el conjunto menor). ≥0.5 = misma localización. */
function overlap(a: string | null | undefined, b: string | null | undefined): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const w of ta) if (tb.has(w)) common++;
  return common / Math.min(ta.size, tb.size);
}

function locationMatches(pred: PredictedLocation, expected: { etiqueta?: string; direccion?: string }): boolean {
  const predTexts = [pred.address_raw, pred.name_raw, pred.formatted_address];
  const expTexts = [expected.direccion, expected.etiqueta];
  for (const p of predTexts) {
    for (const e of expTexts) {
      if (p && e && overlap(p, e) >= 0.5) return true;
    }
  }
  return false;
}

// ── Worker real con req/res simulados ────────────────────────────────────────

function makeMockRes(): { res: any; finished: Promise<{ status: number; body: unknown }> } {
  let resolveFn: (v: { status: number; body: unknown }) => void;
  const finished = new Promise<{ status: number; body: unknown }>((r) => { resolveFn = r; });
  let statusCode = 200;
  const res: any = {
    setHeader: () => res,
    status: (c: number) => { statusCode = c; return res; },
    json: (body: unknown) => { resolveFn({ status: statusCode, body }); return res; },
    end: (body?: unknown) => { resolveFn({ status: statusCode, body }); return res; },
  };
  return { res, finished };
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET;
  if (!supabaseUrl || !serviceKey || !process.env.GEMINI_API_KEY || !cronSecret) {
    console.error("Faltan variables en .env.local (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, CRON_SECRET).");
    process.exit(1);
  }

  // Imports tardíos: después de fijar BYPASS_AI_LIMITS y cargar .env.local.
  const { createClient } = await import("@supabase/supabase-js");
  const workerHandler = (await import("../api/worker.js")).default as (req: any, res: any) => Promise<void>;

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Anotaciones
  if (!existsSync(EVAL_DIR)) { console.error(`No existe ${EVAL_DIR}.`); process.exit(1); }
  const yamlFiles = readdirSync(EVAL_DIR)
    .filter((f) => f.endsWith(".yaml") && f !== "template.yaml")
    // El caso sintético solo corre si se pide explícitamente (--only SELFTEST):
    // sirve para probar el harness, no debe inflar las métricas reales.
    .filter((f) => (ONLY ? f.toLowerCase().includes(ONLY) : !f.startsWith("EVAL_SELFTEST")));

  if (yamlFiles.length === 0) {
    console.log("No hay anotaciones en docs/eval/*.yaml todavía.");
    console.log("Copia docs/eval/template.yaml por cada callsheet, rellénalo, y pon el PDF en docs/eval/callsheets/.");
    process.exit(0);
  }

  const cases: Array<{ file: string; ann: Annotation; pdfPath: string }> = [];
  for (const f of yamlFiles) {
    const ann = parseYaml(readFileSync(join(EVAL_DIR, f), "utf-8")) as Annotation;
    if (!ann?.archivo) { console.warn(`⚠ ${f}: sin campo "archivo", se salta.`); continue; }
    const pdfPath = join(PDF_DIR, ann.archivo);
    if (!existsSync(pdfPath)) { console.warn(`⚠ ${f}: no se encuentra el PDF ${pdfPath}, se salta.`); continue; }
    cases.push({ file: f, ann, pdfPath });
  }
  if (cases.length === 0) { console.error("Ninguna anotación tiene su PDF en docs/eval/callsheets/."); process.exit(1); }

  // 2. Usuario dedicado del eval (se crea una vez, se reutiliza)
  let evalUserId: string;
  {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: EVAL_USER_EMAIL,
      password: `Eval-${cronSecret.slice(0, 12)}`,
      email_confirm: true,
    });
    if (created?.user?.id) {
      evalUserId = created.user.id;
    } else if (String(error?.message ?? "").toLowerCase().includes("already")) {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const u = list?.users?.find((x: any) => x.email === EVAL_USER_EMAIL);
      if (!u) throw new Error("No se pudo localizar el usuario del eval.");
      evalUserId = u.id;
    } else {
      throw new Error(`No se pudo crear el usuario del eval: ${error?.message}`);
    }
  }

  console.log(`\n🧪 Eval del extractor — ${cases.length} callsheet(s) · geocoding: ${GEOCODE ? "SÍ" : "no (usa --geocode)"}\n`);

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const perCase: any[] = [];
  const cleanupJobIds: string[] = [];
  const cleanupPaths: string[] = [];

  // 3. Cada caso: subir PDF → job queued → worker real → leer resultados → puntuar
  for (const c of cases) {
    process.stdout.write(`▶ ${c.ann.archivo} … `);
    const storagePath = `${evalUserId}/eval/${runId}/${basename(c.ann.archivo)}`;
    const pdf = readFileSync(c.pdfPath);

    const { error: upErr } = await admin.storage.from("callsheets").upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
    if (upErr) { console.log(`❌ upload: ${upErr.message}`); continue; }
    cleanupPaths.push(storagePath);

    // Se crea ya "processing" (preClaimed) para que el cron local de
    // scripts/local-api.ts no reclame el job antes que este proceso.
    const { data: job, error: jobErr } = await admin
      .from("callsheet_jobs")
      .insert({
        user_id: evalUserId,
        storage_path: storagePath,
        status: "processing",
        processing_started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (jobErr || !job) { console.log(`❌ job: ${jobErr?.message}`); continue; }
    cleanupJobIds.push(job.id);

    const t0 = Date.now();
    const { res, finished } = makeMockRes();
    await workerHandler(
      {
        method: "POST",
        url: "/api/worker",
        headers: { authorization: `Bearer ${cronSecret}` },
        query: { manual: "1", jobId: job.id, userId: evalUserId, preClaimed: "1", ...(GEOCODE ? {} : { skipGeocode: "1" }) },
        body: {},
      },
      res,
    );
    await finished;
    const ms = Date.now() - t0;

    const { data: jobRow } = await admin.from("callsheet_jobs").select("status, error, needs_review_reason").eq("id", job.id).single();
    const { data: result } = await admin.from("callsheet_results").select("date_value, project_value, producer_value").eq("job_id", job.id).maybeSingle();
    const { data: locs } = await admin.from("callsheet_locations").select("name_raw, address_raw, formatted_address").eq("job_id", job.id);

    // 4. Puntuación
    const expectedLocs = (c.ann.localizaciones ?? []).filter((l) => l.etiqueta || l.direccion);
    const predicted: PredictedLocation[] = (locs ?? []) as any[];

    const dateOk = c.ann.fecha ? String(result?.date_value ?? "") === String(c.ann.fecha) : null;
    const projectOk = c.ann.proyecto ? overlap(result?.project_value, c.ann.proyecto) >= 0.5 : null;

    const matchedExpected = expectedLocs.filter((e) => predicted.some((p) => locationMatches(p, e)));
    const matchedPredicted = predicted.filter((p) => expectedLocs.some((e) => locationMatches(p, e)));
    const recall = expectedLocs.length ? matchedExpected.length / expectedLocs.length : null;
    const precision = predicted.length ? matchedPredicted.length / predicted.length : null;
    const forbiddenHits = (c.ann.excluidas ?? [])
      .filter(Boolean)
      .filter((x) => predicted.some((p) => locationMatches(p, { etiqueta: x, direccion: x })));

    perCase.push({
      archivo: c.ann.archivo,
      status: jobRow?.status ?? "?",
      error: jobRow?.error ?? null,
      needs_review: jobRow?.needs_review_reason ?? null,
      ms,
      fecha: { esperado: c.ann.fecha ?? null, extraido: result?.date_value ?? null, ok: dateOk },
      proyecto: { esperado: c.ann.proyecto ?? null, extraido: result?.project_value ?? null, ok: projectOk },
      localizaciones: {
        esperadas: expectedLocs.length,
        extraidas: predicted.length,
        recall,
        precision,
        noEncontradas: expectedLocs.filter((e) => !matchedExpected.includes(e)).map((e) => e.direccion || e.etiqueta),
        inventadas: predicted.filter((p) => !matchedPredicted.includes(p)).map((p) => p.address_raw || p.name_raw),
        excluidasColadas: forbiddenHits,
      },
    });

    const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
    console.log(
      `${jobRow?.status} en ${(ms / 1000).toFixed(1)}s · fecha ${dateOk == null ? "–" : dateOk ? "✓" : "✗"} · proyecto ${projectOk == null ? "–" : projectOk ? "✓" : "✗"} · loc R:${pct(recall)} P:${pct(precision)}${forbiddenHits.length ? ` · ⚠ ${forbiddenHits.length} excluida(s) colada(s)` : ""}`,
    );
  }

  // 5. Agregado
  const scored = perCase.filter((r) => r.status === "done" || r.status === "needs_review");
  const avg = (xs: Array<number | null>) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const summary = {
    runId,
    date: new Date().toISOString(),
    geocode: GEOCODE,
    cases: perCase.length,
    completed: scored.length,
    fechaAcierto: avg(scored.map((r) => (r.fecha.ok == null ? null : r.fecha.ok ? 1 : 0))),
    proyectoAcierto: avg(scored.map((r) => (r.proyecto.ok == null ? null : r.proyecto.ok ? 1 : 0))),
    locRecall: avg(scored.map((r) => r.localizaciones.recall)),
    locPrecision: avg(scored.map((r) => r.localizaciones.precision)),
  };

  const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
  console.log("\n─────────────────────────────────────────────");
  console.log(`Resumen: ${summary.completed}/${summary.cases} completados`);
  console.log(`  Fecha:        ${pct(summary.fechaAcierto)}`);
  console.log(`  Proyecto:     ${pct(summary.proyectoAcierto)}`);
  console.log(`  Loc. recall:  ${pct(summary.locRecall)}   (objetivo ≥95%)`);
  console.log(`  Loc. precisión: ${pct(summary.locPrecision)} (objetivo ≥95%)`);
  console.log("─────────────────────────────────────────────");

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = join(RESULTS_DIR, `${runId}.json`);
  writeFileSync(outPath, JSON.stringify({ summary, perCase }, null, 2), "utf-8");
  console.log(`\nDetalle guardado en ${outPath}`);

  // 6. Limpieza (jobs, resultados en cascada por FK, archivos y eventos de uso)
  if (!KEEP) {
    if (cleanupJobIds.length) {
      await admin.from("callsheet_jobs").delete().in("id", cleanupJobIds);
      await admin.from("ai_usage_events").delete().in("job_id", cleanupJobIds);
    }
    if (cleanupPaths.length) await admin.storage.from("callsheets").remove(cleanupPaths);
    console.log("Jobs y archivos del eval borrados (usa --keep para conservarlos).");
  } else {
    console.log("--keep: jobs y archivos conservados para inspección.");
  }
}

main().catch((e) => {
  console.error("Eval falló:", e);
  process.exit(1);
});
