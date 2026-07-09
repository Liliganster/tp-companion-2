import { describe, expect, it } from "vitest";
import {
  buildDirectionsCacheKey,
  buildGeocodeCacheKey,
  isGeocodableAddress,
  normalizeAddressForGeocoding,
} from "./geocode";

describe("geocode helpers (Fase 2)", () => {
  it("el centinela 'No location found' y los vacíos no se geocodifican", () => {
    expect(isGeocodableAddress("No location found")).toBe(false);
    expect(isGeocodableAddress("no location found")).toBe(false);
    expect(isGeocodableAddress("")).toBe(false);
    expect(isGeocodableAddress("   ")).toBe(false);
    expect(isGeocodableAddress("Opernring 2, 1010 Wien")).toBe(true);
  });

  it("'Ecke' se normaliza a '&' (intersecciones), sin tocar palabras que la contienen", () => {
    expect(normalizeAddressForGeocoding("Lichtenfelsgasse Ecke Rathausplatz")).toBe(
      "Lichtenfelsgasse & Rathausplatz",
    );
    expect(normalizeAddressForGeocoding("Josefsgasse ECKE Lange Gasse, 1080 Wien")).toBe(
      "Josefsgasse & Lange Gasse, 1080 Wien",
    );
    expect(normalizeAddressForGeocoding("Dreieckgasse 5")).toBe("Dreieckgasse 5");
  });

  it("misma localización escrita distinto comparte clave de caché", () => {
    expect(buildGeocodeCacheKey("Führichgasse 3, 1010 Wien")).toBe(
      buildGeocodeCacheKey("fuhrichgasse 3 1010 wien"),
    );
    expect(buildGeocodeCacheKey("Lichtenfelsgasse Ecke Rathausplatz")).toBe(
      buildGeocodeCacheKey("Lichtenfelsgasse & Rathausplatz"),
    );
  });

  it("la clave de rutas distingue orden y paradas intermedias", () => {
    const aToB = buildDirectionsCacheKey({ origin: "A Str 1", destination: "B Str 2" });
    const bToA = buildDirectionsCacheKey({ origin: "B Str 2", destination: "A Str 1" });
    const withStop = buildDirectionsCacheKey({ origin: "A Str 1", destination: "B Str 2", waypoints: ["C Str 3"] });
    expect(aToB).not.toBe(bToA);
    expect(aToB).not.toBe(withStop);
    expect(
      buildDirectionsCacheKey({ origin: "A Str 1", destination: "B Str 2", waypoints: [] }),
    ).toBe(aToB);
  });
});
