/**
 * Dinero por viaje — helpers compartidos del dashboard (Fase 4) coherentes
 * con el informe: el importe del viaje es km × tarifa de Ajustes.
 * El suplemento por pasajeros va aparte y los gastos
 * (peaje/parking/combustible/otros) son su propia suma.
 */
import type { Trip } from "@/contexts/TripsContext";
import type { UserProfile } from "@/contexts/UserProfileContext";
import { parseLocaleNumber } from "@/lib/number";

export const DEFAULT_RATE_PER_KM = 0.50;
export const DEFAULT_PASSENGER_SURCHARGE = 0.15;

function configuredRate(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : parseLocaleNumber(value);
  return parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Settings is the only rate source. An explicit zero is a valid user choice. */
export function getProfileRates(profile: Partial<Pick<UserProfile, "ratePerKm" | "passengerSurcharge">>) {
  return {
    ratePerKm: configuredRate(profile.ratePerKm, DEFAULT_RATE_PER_KM),
    passengerSurcharge: configuredRate(profile.passengerSurcharge, DEFAULT_PASSENGER_SURCHARGE),
  };
}

/** Legacy trip overrides remain stored, but never override the Settings rate. */
export function rateForTrip(_trip: Pick<Trip, "ratePerKmOverride">, settingsRatePerKm: number): number {
  return configuredRate(settingsRatePerKm, DEFAULT_RATE_PER_KM);
}

/** Kilometraje del viaje: km × tarifa (sin pasajeros ni gastos). */
export function tripKilometrageAmount(trip: Pick<Trip, "distance" | "ratePerKmOverride">, defaultRatePerKm: number): number {
  const distance = Number.isFinite(trip.distance) ? trip.distance : 0;
  return distance * rateForTrip(trip, defaultRatePerKm);
}

/**
 * Suplemento por pasajeros del viaje: pasajeros × recargo. SIEMPRE separado
 * del kilometraje en todas las vistas (regla de la propietaria 2026-07-10);
 * solo el informe puede unirlos, con opción explícita.
 */
export function tripPassengersAmount(trip: Pick<Trip, "passengers">, passengerSurcharge: number): number {
  const passengers = Number.isFinite(trip.passengers) ? trip.passengers : 0;
  const surcharge = configuredRate(passengerSurcharge, DEFAULT_PASSENGER_SURCHARGE);
  return passengers * surcharge;
}

/** Gastos del viaje (peaje + parking + combustible + otros). */
export function tripExpensesAmount(
  trip: Pick<Trip, "tollAmount" | "parkingAmount" | "fuelAmount" | "otherExpenses">,
): number {
  const amounts = [trip.tollAmount, trip.parkingAmount, trip.fuelAmount, trip.otherExpenses];
  return amounts.reduce<number>(
    (acc, v) => acc + (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0),
    0,
  );
}

/** € a facturar de un conjunto de viajes: kilometraje + pasajeros + gastos. */
export function billableAmount(trips: Trip[], defaultRatePerKm: number, passengerSurcharge: number): number {
  return trips.reduce(
    (acc, trip) =>
      acc +
      tripKilometrageAmount(trip, defaultRatePerKm) +
      tripPassengersAmount(trip, passengerSurcharge) +
      tripExpensesAmount(trip),
    0,
  );
}

/**
 * Coste real por km del coche, desde el PERFIL (sin APIs, sin fotos):
 * combustible (consumo × precio) o electricidad + mantenimiento + otros.
 * Null si faltan los datos mínimos (consumo y precio) → la tarjeta del
 * dashboard muestra el CTA a Ajustes en vez de una cifra inventada.
 */
export function vehicleCostPerKm(profile: UserProfile): number | null {
  const maintenance = parseLocaleNumber(profile.maintenanceEurPerKm) || 0;
  const other = parseLocaleNumber(profile.otherEurPerKm) || 0;

  let energyPerKm: number | null = null;
  if (profile.fuelType === "ev") {
    const kwhPer100 = parseLocaleNumber(profile.evKwhPer100Km);
    const pricePerKwh = parseLocaleNumber(profile.electricityPricePerKwh);
    if (kwhPer100 > 0 && pricePerKwh > 0) energyPerKm = (kwhPer100 / 100) * pricePerKwh;
  } else if (profile.fuelType === "gasoline" || profile.fuelType === "diesel") {
    const lPer100 = parseLocaleNumber(profile.fuelLPer100Km);
    const pricePerLiter = parseLocaleNumber(profile.fuelPricePerLiter);
    if (lPer100 > 0 && pricePerLiter > 0) energyPerKm = (lPer100 / 100) * pricePerLiter;
  }

  if (energyPerKm == null) return null;
  return energyPerKm + maintenance + other;
}
