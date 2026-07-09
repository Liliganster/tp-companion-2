import { describe, expect, it } from "vitest";
import { calculateTreesNeeded, calculateTripEmissions } from "./emissions";

describe("calculateTripEmissions (Fase 5: donde hay dinero/datos)", () => {
  it("gasolina por consumo: L/100km × factor físico 2,31", () => {
    const r = calculateTripEmissions({ distanceKm: 100, fuelType: "gasoline", fuelLPer100Km: 7 });
    // 7 L × 2,31 kg/L = 16,17 → redondeado a 1 decimal
    expect(r.co2Kg).toBe(16.2);
    expect(r.method).toBe("fuel");
    expect(r.liters).toBe(7);
  });

  it("diésel con litros reales del viaje: prioridad sobre el consumo teórico", () => {
    const r = calculateTripEmissions({ distanceKm: 100, fuelType: "diesel", fuelLPer100Km: 6, fuelLiters: 10 });
    // 10 L reales × 2,68 kg/L = 26,8
    expect(r.co2Kg).toBe(26.8);
    expect(r.liters).toBe(10);
  });

  it("factor por km (WTW) tiene prioridad máxima cuando está disponible", () => {
    const r = calculateTripEmissions({ distanceKm: 100, fuelType: "gasoline", fuelLPer100Km: 7, fuelKgCo2ePerKm: 0.2472 });
    expect(r.co2Kg).toBe(24.72);
    expect(r.method).toBe("fuel");
  });

  it("EV: kWh/100km × factor de red × 1,08 de pérdidas de red", () => {
    const r = calculateTripEmissions({ distanceKm: 100, fuelType: "ev", evKwhPer100Km: 18, gridKgCo2PerKwh: 0.1 });
    // 18 kWh × 0,10 × 1,08 = 1,944 → 1,9
    expect(r.co2Kg).toBe(1.9);
    expect(r.method).toBe("ev");
    expect(r.kwh).toBe(18);
  });

  it("sin datos de vehículo: fallback 0,21 kg/km", () => {
    const r = calculateTripEmissions({ distanceKm: 100 });
    expect(r.co2Kg).toBe(21);
    expect(r.method).toBe("fallback_km");
  });

  it("distancia inválida o cero → 0", () => {
    expect(calculateTripEmissions({ distanceKm: 0 }).co2Kg).toBe(0);
    expect(calculateTripEmissions({ distanceKm: Number.NaN }).co2Kg).toBe(0);
  });

  it("CO2 por pasajero divide entre los pasajeros (mínimo 1)", () => {
    const r = calculateTripEmissions({ distanceKm: 100, passengers: 2 });
    expect(r.co2KgPerPassenger).toBe(10.5);
    expect(calculateTripEmissions({ distanceKm: 100, passengers: 0 }).co2KgPerPassenger).toBe(21);
  });
});

describe("calculateTreesNeeded", () => {
  it("~21 kg CO2 por árbol y año, redondeo hacia arriba", () => {
    expect(calculateTreesNeeded(42)).toBe(2);
    expect(calculateTreesNeeded(43)).toBe(3);
    expect(calculateTreesNeeded(0)).toBe(0);
    expect(calculateTreesNeeded(-5)).toBe(0);
  });
});
