/**
 * Tabla estática de factores de emisión — Fase 1 del PLAN.md.
 *
 * Sustituye a las APIs Climatiq y Electricity Maps. La mayor precisión del
 * cálculo viene del consumo real del vehículo del usuario (L/100km o
 * kWh/100km del perfil), no de factores por API.
 *
 * Actualización: MANUAL, una vez al año (revisar las fuentes y ajustar).
 */

/**
 * Combustible — metodología TANQUE-A-RUEDA (tank-to-wheel): CO₂ emitido al
 * quemar un litro. Es física de la combustión, no varía por país ni por año.
 * No incluye emisiones de refinado/transporte del combustible (pozo-a-tanque).
 * Fuente: estequiometría de la combustión; valores estándar citados p. ej.
 * por Umweltbundesamt (DE/AT) y JEC Well-to-Wheels Report (UE).
 */
export const GASOLINE_KG_CO2_PER_LITER = 2.31;
export const DIESEL_KG_CO2_PER_LITER = 2.68;
export const FUEL_FACTOR_SOURCE = "Combustión física (tanque-a-rueda) · Umweltbundesamt / JEC WTW";

/**
 * Red eléctrica (EV) — media ANUAL de intensidad de CO₂ de la generación
 * eléctrica por país, en kg CO₂/kWh (último año completo, redondeado).
 *
 * Fuente: Ember "Carbon intensity of electricity", vía Our World in Data
 *   https://ourworldindata.org/grapher/carbon-intensity-electricity
 *   (equivalente al indicador de la EEA "GHG emission intensity of
 *   electricity generation"). Valores 2024: AT 103, DE 336, CZ 414, HU 184
 *   g CO₂/kWh — verificados el 2026-07-08.
 *
 * ACTUALIZACIÓN MANUAL ANUAL: revisar esa URL y ajustar cifras + año.
 */
export const GRID_FACTORS_YEAR = 2024;

export type GridZone = "AT" | "DE" | "CZ" | "HU";

export const GRID_KG_CO2_PER_KWH: Record<GridZone, number> = {
  AT: 0.10, // Austria: mucha hidráulica (103 g/kWh en 2024)
  DE: 0.34, // Alemania (336 g/kWh en 2024)
  CZ: 0.41, // Chequia: carbón todavía relevante (414 g/kWh en 2024)
  HU: 0.18, // Hungría (184 g/kWh en 2024)
};

export const DEFAULT_GRID_ZONE: GridZone = "AT";

/** Mapea el país del perfil (texto libre) a una zona de red. Por defecto AT. */
export function gridZoneForCountry(country: string | null | undefined): GridZone {
  const c = String(country ?? "").trim().toLowerCase();
  if (!c) return DEFAULT_GRID_ZONE;
  if (c === "de" || c.includes("deutschland") || c.includes("germany") || c.includes("alemania")) return "DE";
  if (c === "cz" || c.includes("czech") || c.includes("tschech") || c.includes("chequia") || c.includes("česk")) return "CZ";
  if (c === "hu" || c.includes("hungary") || c.includes("ungarn") || c.includes("hungría") || c.includes("magyar")) return "HU";
  return DEFAULT_GRID_ZONE;
}

/**
 * Árboles equivalentes — un árbol maduro absorbe ~21 kg de CO₂ al año
 * (valor aproximado, muy dependiente de especie y clima).
 * Fuente: aprox. habitual citada por Arbor Day Foundation / EPA (≈48 lb/año).
 */
export const TREE_KG_CO2_PER_YEAR = 21;
