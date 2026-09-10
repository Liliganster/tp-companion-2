import { describe, expect, it } from "vitest";
import { classifyLabeledLocations } from "./callsheetLabels";

describe("classifyLabeledLocations (híbrido: red de seguridad)", () => {
  it("caso REX real: se queda el MOTIV y descarta BASIS/PARKEN/ÖFFIS/E-Tankstelle", () => {
    const r = classifyLabeledLocations([
      { label: "MOTIV", address: "1190, Wildgrubgasse. Zufahrt via Kahlenberger Str 213" },
      { label: "BASIS", address: "1190, Friedhof Heiligenstadt, Wildgrubgasse 18" },
      { label: "PARKEN TECHNIK", address: "Güterweg entlang der Weinberge" },
      { label: "ÖFFIS", address: "Bim Nr 38 bis Grinzing und 15 Minuten zu Fuß" },
      { label: "E-Tankstelle", address: "Greinergasse 36-40, 1190 Wien" },
    ]);
    expect(r.filming.map((f) => f.label)).toEqual(["MOTIV"]);
    expect(r.dropped).toHaveLength(4);
  });

  it("meeting point y Parkplatz son logística (regla de la propietaria)", () => {
    const r = classifyLabeledLocations([
      { label: "Location 1", address: "Stadtpark, Parkring 1, 1010 Wien" },
      { label: "Meeting Point", address: "Kursalon Hübner, Johannesgasse 33" },
      { label: "Parkplatz Crew", address: "Am Heumarkt 8" },
    ]);
    expect(r.filming.map((f) => f.address)).toEqual(["Stadtpark, Parkring 1, 1010 Wien"]);
    expect(r.dropped).toHaveLength(2);
  });

  it("etiqueta desconocida necesita contexto; Essen no confunde", () => {
    const r = classifyLabeledLocations([
      { label: "DREHORT", address: "Rüttenscheider Str. 2, 45128 Essen" },
      { label: "", address: "Opernring 2, 1010 Wien" },
      { label: "Etiqueta rara", address: "Goethegasse 1, 1010 Wien" },
    ]);
    expect(r.filming).toHaveLength(1);
    expect(r.dropped).toHaveLength(2);
  });

  it("conserva lugares sin calle ni numero cuando se identifican como sets", () => {
    const addresses = ['Staatsoper', 'Stadtpark', 'Nationalbibliothek', 'Lichtenfelsgasse Ecke Rathausplatz'];
    const result = classifyLabeledLocations(addresses.map(address => ({ label: 'MOTIV', address })));
    expect(result.filming.map(l => l.address)).toEqual(addresses);
    expect(result.dropped).toEqual([]);
  });

  it("addressCorrected viaja con la localización de rodaje (errata corregida)", () => {
    const r = classifyLabeledLocations([
      { label: "LOC 3", address: "Matiellistrasse 2", addressCorrected: "Mattiellistraße 2, 1040 Wien" } as any,
      { label: "PARKEN", address: "Am Heumarkt 8", addressCorrected: "Am Heumarkt 8, 1030 Wien" } as any,
    ]);
    expect(r.filming).toEqual([
      { label: "LOC 3", address: "Matiellistrasse 2", addressCorrected: "Mattiellistraße 2, 1040 Wien" },
    ]);
    expect(r.dropped).toHaveLength(1);
  });

  it("catering/maske/office fuera; conserva etiquetas de sets distintos en la misma dirección", () => {
    const r = classifyLabeledLocations([
      { label: "LOCATION 2", address: "Josefsgasse 12, 1080 Wien" },
      { label: "Catering", address: "Zelt am Set" },
      { label: "Maske / Garderobe", address: "Bus 1" },
      { label: "SET", address: "Josefsgasse 12, 1080 Wien" },
    ]);
    expect(r.filming.map((f) => f.label)).toEqual(["LOCATION 2", "SET"]);
    expect(r.dropped.map((d) => d.reason)).toEqual([
      "logistics_label:Catering",
      "logistics_label:Maske / Garderobe",
    ]);
  });
});
