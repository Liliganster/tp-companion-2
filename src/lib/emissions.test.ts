import { describe, expect, it } from "vitest";
import { calculateTreesNeeded, calculateTripEmissions, formatTreeEquivalent, type TripEmissionsInput } from "./emissions";

const gasoline: TripEmissionsInput = { distanceKm: 100, fuelType: "gasoline", fuelLPer100Km: 7 };
const diesel: TripEmissionsInput = { distanceKm: 100, fuelType: "diesel", fuelLPer100Km: 6 };
const ev: TripEmissionsInput = { distanceKm: 100, fuelType: "ev", evKwhPer100Km: 18, gridKgCo2PerKwh: 0.1 };

describe("configured vehicle emissions", () => {
  it.each([[gasoline,16.17],[diesel,16.08],[ev,1.8]] as const)("retains precision for %j", (input, expected) => {
    expect(calculateTripEmissions(input).co2Kg).toBeCloseTo(expected, 10);
  });
  it.each([gasoline,diesel,ev])("legacy trip energy and fleet factors cannot override %j", input => {
    const normal=calculateTripEmissions(input);
    expect(calculateTripEmissions({...input,fuelLiters:50,evKwhUsed:120,fuelKgCo2ePerKm:0.9})).toEqual(normal);
    expect(calculateTripEmissions({...input, fuelLiters:0, evKwhUsed:0})).toEqual(normal);
  });
  it.each([gasoline,diesel,ev,{distanceKm:100}])("splitting trips preserves the total for %j", input => {
    const parts=[0.1,0.9,1,3,5];
    const sum=parts.reduce((total,distanceKm)=>total+calculateTripEmissions({...input,distanceKm}).co2Kg,0);
    expect(sum).toBeCloseTo(calculateTripEmissions({...input,distanceKm:10}).co2Kg,12);
  });
  it("consumption settings determine energy and changing the vehicle is allowed",()=>{
    expect(calculateTripEmissions({...gasoline,fuelLPer100Km:10}).co2Kg).toBeCloseTo(23.1);
    expect(calculateTripEmissions({...gasoline,fuelType:'diesel'}).co2Kg).toBeCloseTo(18.76);
    expect(calculateTripEmissions({...ev,evKwhPer100Km:25}).co2Kg).toBeCloseTo(2.5);
  });
  it("missing consumption uses the same generic estimate despite legacy energy",()=>{
    expect(calculateTripEmissions({distanceKm:100,fuelType:'diesel',fuelLiters:50})).toMatchObject({co2Kg:21,method:'fallback_km'});
  });
  it("accepts zero electricity intensity without switching to a generic car",()=>{
    expect(calculateTripEmissions({...ev,gridKgCo2PerKwh:0})).toMatchObject({co2Kg:0,method:'ev'});
  });
  it.each([0,-1,NaN,Infinity])("invalid distance %s produces zero",distanceKm=>{
    expect(calculateTripEmissions({...gasoline,distanceKm}).co2Kg).toBe(0);
  });
  it("per-person presentation cannot change total vehicle emissions",()=>{
    const result=calculateTripEmissions({...gasoline,passengers:3});
    expect(result.co2Kg).toBeCloseTo(16.17);
    expect(result.co2KgPerPassenger).toBeCloseTo(5.39);
  });
});

describe("illustrative annual tree equivalent",()=>{
  it("does not round up whole trees",()=>{
    expect(calculateTreesNeeded(16.17)).toBeCloseTo(0.77);
    expect(calculateTreesNeeded(21.1)).toBeCloseTo(1.00476190476);
    expect(calculateTreesNeeded(43)).toBeCloseTo(2.04761904762);
  });
  it.each([0,-5,NaN,Infinity])("handles invalid CO2 %s",kg=>expect(calculateTreesNeeded(kg)).toBe(0));
  it("rejects an invalid absorption factor",()=>{
    expect(calculateTreesNeeded(10,0)).toBe(0);
    expect(calculateTreesNeeded(10,NaN)).toBe(0);
  });
  it("displays whole illustrative trees and keeps small amounts below one",()=>{
    expect(formatTreeEquivalent(calculateTreesNeeded(16.17),'es')).toBe('1');
    expect(formatTreeEquivalent(calculateTreesNeeded(16.17),'en')).toBe('1');
    expect(formatTreeEquivalent(calculateTreesNeeded(0.1),'de')).toBe('< 1');
  });
});
