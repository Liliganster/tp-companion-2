/**
 * Dinero por viaje — helpers compartidos del dashboard (Fase 4) coherentes
 * con el informe (Fase 3): el importe del viaje es km × tarifa (el override
 * del viaje manda), el suplemento por pasajeros va aparte y los gastos
 * (peaje/parking/combustible/otros) son su propia suma.
 */
import type { Trip } from "@/contexts/TripsContext";
import type { UserProfile } from "@/contexts/UserProfileContext";
import { parseLocaleNumber } from "@/lib/number";

export function rateForTrip(trip: Pick<Trip, "ratePerKmOverride">, defaultRatePerKm: number): number {
  return typeof trip.ratePerKmOverride === "number" && Number.isFinite(trip.ratePerKmOverride)
    ? trip.ratePerKmOverride
    : defaultRatePerKm;
}

/** Kilometraje del viaje: km × tarifa (sin pasajeros ni gastos). */
export function tripKilometrageAmount(trip: Pick<Trip, "distance" | "ratePerKmOverride">, defaultRatePerKm: number): number {
  const distance = Number.isFinite(trip.distance) ? trip.distance : 0;
  return distance * rateForTrip(trip, defaultRatePerKm);
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
      (Number.isFinite(trip.passengers) ? trip.passengers : 0) * passengerSurcharge +
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
