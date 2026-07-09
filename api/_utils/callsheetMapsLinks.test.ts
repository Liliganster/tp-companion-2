import { describe, expect, it } from "vitest";
import {
  extractMapsLinkCandidates,
  matchMapsLinkToLocation,
  parseResolvedMapsUrl,
} from "./callsheetMapsLinks";

describe("extractMapsLinkCandidates", () => {
  it("extrae enlaces con su línea de contexto (caso REX real)", () => {
    const text = [
      "MOTIV 1190, Wildgrubgasse. Zufahrt via Kahlenberger Str 213 https://maps.app.goo.gl/BLnr5A6Ejo4tKciKA",
      "BASIS 1190, Friedhof Heiligenstadt, Wildgrubgasse 18 https://maps.app.goo.gl/2ncYer5uXKXPEBQq9",
      "PARKEN TECHNIK Güterweg entlang der Weinberge neben dem Motiv",
    ].join("\n");

    const links = extractMapsLinkCandidates(text);
    expect(links).toHaveLength(2);
    expect(links[0].url).toBe("https://maps.app.goo.gl/BLnr5A6Ejo4tKciKA");
    expect(links[0].context).toContain("Kahlenberger Str 213");
    expect(links[1].context).toContain("Friedhof Heiligenstadt");
  });

  it("ignora texto sin enlaces", () => {
    expect(extractMapsLinkCandidates("MOTIV: Stephansplatz 1, 1010 Wien")).toEqual([]);
  });
});

describe("matchMapsLinkToLocation", () => {
  const candidates = extractMapsLinkCandidates(
    [
      "MOTIV 1190, Wildgrubgasse. Zufahrt via Kahlenberger Str 213 https://maps.app.goo.gl/MOTIVLINK",
      "BASIS 1190, Friedhof Heiligenstadt, Wildgrubgasse 18 https://maps.app.goo.gl/BASISLINK",
    ].join("\n"),
  );

  it("asocia la localización con el enlace de SU línea, no con el de la base", () => {
    const url = matchMapsLinkToLocation("1190, Wildgrubgasse. Zufahrt via Kahlenberger Str 213", candidates);
    expect(url).toBe("https://maps.app.goo.gl/MOTIVLINK");
  });

  it("con un único enlace y única localización, los une aunque el texto no coincida", () => {
    const single = extractMapsLinkCandidates("Treffpunkt siehe Link https://maps.app.goo.gl/SOLO");
    expect(matchMapsLinkToLocation("Palais Rasumofsky", single, { totalLocations: 1 })).toBe(
      "https://maps.app.goo.gl/SOLO",
    );
    expect(matchMapsLinkToLocation("Palais Rasumofsky", single, { totalLocations: 3 })).toBeNull();
  });
});

describe("parseResolvedMapsUrl", () => {
  it("parsea /maps/place con nombre y pin exacto (!3d/!4d)", () => {
    const r = parseResolvedMapsUrl(
      "https://www.google.com/maps/place/Mayer+am+Nussberg+-+DIE+Buschenschank./@48.2694351,16.3392664,17z/data=!3m1!4b1!4m6!3m5!1s0x476d:0x5e5!8m2!3d48.2694316!4d16.3418413",
    );
    expect(r).not.toBeNull();
    expect(r!.label).toBe("Mayer am Nussberg - DIE Buschenschank.");
    expect(r!.lat).toBeCloseTo(48.2694316, 5); // pin !3d, no el centro del mapa @
    expect(r!.lng).toBeCloseTo(16.3418413, 5);
  });

  it("parsea /maps/search/lat,+lng (enlace de coordenadas puras)", () => {
    const r = parseResolvedMapsUrl("https://www.google.com/maps/search/48.209765,+16.358099?entry=tts");
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(48.209765, 5);
    expect(r!.lng).toBeCloseTo(16.358099, 5);
    expect(r!.label).toBeNull();
  });

  it("devuelve null si no hay coordenadas", () => {
    expect(parseResolvedMapsUrl("https://www.google.com/maps")).toBeNull();
  });
});
