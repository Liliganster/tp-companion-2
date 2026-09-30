import { describe, expect, it } from "vitest";
import type { Trip } from "@/contexts/TripsContext";
import type { UserProfile } from "@/contexts/UserProfileContext";
import { billableAmount, getProfileRates, rateForTrip, tripExpensesAmount, tripKilometrageAmount, tripPassengersAmount, vehicleCostPerKm } from "./tripMoney";

const trip = (over: Partial<Trip>): Trip =>
  ({ id: "t1", date: "2026-07-01", route: [], project: "", purpose: "", passengers: 0, co2: 0, distance: 0, ...over }) as Trip;

describe("tripMoney (Fase 5: los mismos números que el informe)", () => {
  it("la tarifa de Ajustes manda incluso sobre tarifas antiguas del viaje", () => {
    expect(rateForTrip({ ratePerKmOverride: 0.42 }, 0.5)).toBe(0.5);
    expect(rateForTrip({ ratePerKmOverride: 0 }, 0.65)).toBe(0.65);
    expect(rateForTrip({ ratePerKmOverride: null }, 0.5)).toBe(0.5);
    expect(rateForTrip({}, 0.5)).toBe(0.5);
  });

  it("aplica valores por defecto solo a tarifas ausentes o no válidas", () => {
    for (const value of [undefined, "", "  ", "invalid", "-1", "Infinity"]) {
      expect(getProfileRates({ ratePerKm: value, passengerSurcharge: value })).toEqual({ ratePerKm: 0.5, passengerSurcharge: 0.15 });
    }
    expect(getProfileRates({ ratePerKm: "0", passengerSurcharge: "0,00" })).toEqual({ ratePerKm: 0, passengerSurcharge: 0 });
    expect(getProfileRates({ ratePerKm: "0,65", passengerSurcharge: "0.25" })).toEqual({ ratePerKm: 0.65, passengerSurcharge: 0.25 });
    expect(getProfileRates({ ratePerKm: "0,65" })).toEqual({ ratePerKm: 0.65, passengerSurcharge: 0.15 });
  });

  it("recalcula viajes antiguos con las tarifas actuales de Ajustes", () => {
    const journey = trip({ distance: 405, passengers: 2, ratePerKmOverride: 0.3 });
    const defaults = getProfileRates({});
    expect(tripKilometrageAmount(journey, defaults.ratePerKm)).toBe(202.5);
    expect(billableAmount([journey], defaults.ratePerKm, defaults.passengerSurcharge)).toBeCloseTo(202.8);
    const custom = getProfileRates({ ratePerKm: "0,65", passengerSurcharge: "0,25" });
    expect(billableAmount([journey], custom.ratePerKm, custom.passengerSurcharge)).toBeCloseTo(263.75);
  });

  it("kilometraje = km × tarifa (sin pasajeros ni gastos)", () => {
    expect(tripKilometrageAmount(trip({ distance: 10 }), 0.5)).toBe(5);
    expect(tripKilometrageAmount(trip({ distance: 10, ratePerKmOverride: 0.42 }), 0.5)).toBe(5);
    expect(tripKilometrageAmount(trip({ distance: Number.NaN }), 0.5)).toBe(0);
  });

  it("suplemento por pasajeros = pasajeros × recargo, SEPARADO del kilometraje", () => {
    expect(tripPassengersAmount(trip({ passengers: 2 }), 0.15)).toBeCloseTo(0.3);
    expect(tripPassengersAmount(trip({ passengers: 0 }), 0.15)).toBe(0);
    expect(tripPassengersAmount(trip({ passengers: Number.NaN }), 0.15)).toBe(0);
    expect(tripPassengersAmount(trip({ passengers: 2 }), Number.NaN)).toBeCloseTo(0.3);
    // El kilometraje NO incluye pasajeros (regla: separados en todas las vistas)
    expect(tripKilometrageAmount(trip({ distance: 10, passengers: 5 }), 0.5)).toBe(5);
  });

  it("gastos: suma peaje+parking+combustible+otros; ignora nulos y negativos", () => {
    expect(tripExpensesAmount(trip({ tollAmount: 5, parkingAmount: 3, fuelAmount: 20, otherExpenses: 2 }))).toBe(30);
    expect(tripExpensesAmount(trip({ tollAmount: null, parkingAmount: -1 }))).toBe(0);
    expect(tripExpensesAmount(trip({}))).toBe(0);
  });

  it("€ a facturar: kilometraje + suplemento por pasajeros + gastos", () => {
    const trips = [
      trip({ distance: 10, passengers: 2, tollAmount: 5 }), // 5 + 2×0,15 + 5
      trip({ distance: 20, ratePerKmOverride: 0.4 }),       // 10 (Ajustes)
    ];
    expect(billableAmount(trips, 0.5, 0.15)).toBeCloseTo(5 + 0.3 + 5 + 10);
  });

  it("coste del coche por km desde el perfil (gasolina)", () => {
    const profile = {
      fuelType: "gasoline",
      fuelLPer100Km: "7",
      fuelPricePerLiter: "1,70",
      maintenanceEurPerKm: "0,05",
      otherEurPerKm: "0,02",
      evKwhPer100Km: "",
      electricityPricePerKwh: "",
    } as UserProfile;
    // 0,07 L/km × 1,70 + 0,05 + 0,02 = 0,189
    expect(vehicleCostPerKm(profile)).toBeCloseTo(0.189);
  });

  it("coste del coche por km desde el perfil (EV)", () => {
    const profile = {
      fuelType: "ev",
      evKwhPer100Km: "18",
      electricityPricePerKwh: "0,25",
      maintenanceEurPerKm: "0,04",
      otherEurPerKm: "",
      fuelLPer100Km: "",
      fuelPricePerLiter: "",
    } as UserProfile;
    // 0,18 kWh/km × 0,25 + 0,04 = 0,085
    expect(vehicleCostPerKm(profile)).toBeCloseTo(0.085);
  });

  it("sin consumo o precio → null (la tarjeta muestra el CTA, no inventa)", () => {
    expect(vehicleCostPerKm({ fuelType: "gasoline", fuelLPer100Km: "7", fuelPricePerLiter: "" } as UserProfile)).toBeNull();
    expect(vehicleCostPerKm({ fuelType: "unknown" } as UserProfile)).toBeNull();
  });
});
