/**
 * Auditoría de responsividad — pedido de la propietaria 2026-07-10.
 *
 * Recorre las páginas principales en móvil / tablet / escritorio con el
 * usuario smoke, captura pantalla completa de cada una y FALLA si el
 * documento desborda horizontalmente (el body nunca debe tener scroll
 * lateral). Las capturas quedan en test-results/responsive/.
 *
 * Lanzar con: npm run test:e2e -- e2e/responsive-audit.spec.ts
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8").replace(/^﻿/, "");
    const out: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = loadEnvLocal();
const EMAIL = process.env.E2E_EMAIL ?? "smoke-test@fahrtenbuchpro.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "SmokeTest!2026";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "";

const VIEWPORTS = [
  { name: "movil", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const PAGES: Array<{ name: string; path: string }> = [
  { name: "dashboard", path: "/" },
  { name: "viajes", path: "/trips" },
  { name: "proyectos", path: "/projects" },
  { name: "informes", path: "/reports" },
  { name: "calendario", path: "/calendar" },
  { name: "planes", path: "/plans" },
  { name: "docs", path: "/docs" },
];

for (const vp of VIEWPORTS) {
  test(`sin desbordes horizontales en ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
    test.skip(!SUPABASE_URL, "Falta VITE_SUPABASE_URL (.env.local)");
    test.setTimeout(240_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // El banner de cookies taparía la página: consentimiento decidido de antemano.
    // El tutorial interactivo tampoco debe auto-arrancar encima del test.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("tp.analytics_consent.v1", "denied");
        sessionStorage.setItem("fb:tour:auto-checked", "1");
      } catch {
        /* ignore */
      }
    });

    const measureOverflow = () =>
      page.evaluate(() => {
        const el = document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });

    const problems: string[] = [];

    // Login (y auditoría de la propia pantalla de login). 60s: la PRIMERA
    // carga contra un dev server frío compila ~3300 módulos y tarda más de 30.
    await page.goto("/auth");
    await page.waitForSelector("#email", { timeout: 60_000 });
    await page.screenshot({ path: `test-results/responsive/${vp.name}-auth.png`, fullPage: true });
    const authOverflow = await measureOverflow();
    if (authOverflow > 1) problems.push(`auth (/auth): ${authOverflow}px de scroll horizontal`);

    await page.fill("#email", EMAIL);
    await page.fill("#password", PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });

    for (const p of PAGES) {
      await page.goto(p.path);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(800);
      const overflow = await measureOverflow();
      await page.screenshot({ path: `test-results/responsive/${vp.name}-${p.name}.png`, fullPage: true });
      if (overflow > 1) problems.push(`${p.name} (${p.path}): ${overflow}px de scroll horizontal`);
    }

    expect(problems, problems.join("\n")).toEqual([]);
  });
}
