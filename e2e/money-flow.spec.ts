/**
 * E2E del flujo de dinero — Fase 5 del PLAN.md:
 *   login → crear viaje manual → verlo en el informe.
 *
 * Corre contra el dev server local (:8080) y el Supabase REAL con el usuario
 * smoke de pruebas (override con E2E_EMAIL/E2E_PASSWORD). Los viajes creados
 * llevan un marcador en el propósito y se limpian por Supabase antes y
 * después (no dependemos de la UI para el teardown).
 *
 * Lanzar con: npm run test:e2e -- e2e/money-flow.spec.ts
 */
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal(): Record<string, string> {
  try {
    // ESM: sin __dirname; Playwright corre desde la raíz del repo.
    // El BOM comería la primera línea (que es justo VITE_SUPABASE_URL).
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8").replace(/^\uFEFF/, "");
    const out: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch (err) {
    console.log(`[e2e] no se pudo leer .env.local: ${String(err)}`);
    return {};
  }
}

const env = loadEnvLocal();
const EMAIL = process.env.E2E_EMAIL ?? "smoke-test@fahrtenbuchpro.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "SmokeTest!2026";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? "";

const MARKER = "E2E-Rodaje";
const PURPOSE = `${MARKER} ${Date.now()}`;
const ORIGIN = "Teststraße 1, 1010 Wien";
const DESTINATION = "Teststraße 9, 1090 Wien";
const today = new Date();
const TRIP_DATE = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

let sb: SupabaseClient | null = null;

async function cleanupMarkedTrips() {
  if (!sb) return;
  await sb.from("trips").delete().ilike("purpose", `${MARKER}%`);
}

/** Espera a que el viaje esté PERSISTIDO en Supabase (no solo optimista en la UI). */
async function waitForTripInDb(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await sb!.from("trips").select("id").eq("purpose", PURPOSE).limit(1);
    if ((data ?? []).length > 0) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("El viaje no llegó a Supabase: el insert falló o fue abortado");
}

test.beforeAll(async () => {
  console.log(`[e2e] env cargado: url=${Boolean(SUPABASE_URL)} anon=${Boolean(SUPABASE_ANON_KEY)}`);
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, "Faltan VITE_SUPABASE_URL/ANON_KEY (.env.local)");
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`No se pudo iniciar sesión con el usuario smoke: ${error.message}`);
  await cleanupMarkedTrips();
});

test.afterAll(async () => {
  await cleanupMarkedTrips();
});

test("login → crear viaje → generar informe", async ({ page }) => {
  // El banner de cookies taparía los botones: consentimiento decidido de antemano.
  // El tutorial interactivo tampoco debe auto-arrancar encima del test.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("tp.analytics_consent.v1", "denied");
      sessionStorage.setItem("fb:tour:auto-checked", "1");
    } catch {
      /* ignore */
    }
  });

  // 1) Login
  await page.goto("/auth");
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });

  // 2) Crear un viaje manual (deep-link del dashboard abre el modal)
  await page.goto("/trips?action=add");
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  await dialog.locator("#date").fill(TRIP_DATE);

  // Origen y destino: los inputs de parada son los únicos `input.h-8` del modal.
  const routeInputs = dialog.locator("input.h-8");
  await expect(routeInputs).toHaveCount(2);
  await routeInputs.nth(0).fill(ORIGIN);
  await routeInputs.nth(0).press("Tab");
  await routeInputs.nth(1).fill(DESTINATION);
  await routeInputs.nth(1).press("Tab");

  await dialog.locator("#distance").fill("12.5");
  await dialog.locator("#purpose").fill(PURPOSE);

  await dialog
    .getByRole("button", { name: /^(guardar viaje|save trip|fahrt speichern)$/i })
    .click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // El viaje aparece en la lista (celda de tabla visible; getByText a secas
  // encuentra primero el duplicado oculto del layout móvil)
  await expect(page.getByRole("cell", { name: /Teststraße 1/ }).first()).toBeVisible({ timeout: 20_000 });

  // Y está PERSISTIDO en la BD (no solo el update optimista) antes de
  // recargar la página — navegar antes abortaría el insert en vuelo.
  await waitForTripInDb();

  // 3) Informe del día: el viaje y sus km están en la vista del informe
  await page.goto(`/reports/view?project=all&startDate=${TRIP_DATE}&endDate=${TRIP_DATE}`);
  await expect(page.getByRole("cell", { name: /Teststraße 1/ }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("cell", { name: /12[.,]5/ }).first()).toBeVisible();
});
