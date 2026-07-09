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

  it("recall manda: etiqueta desconocida o vacía se conserva (y Essen no confunde)", () => {
    const r = classifyLabeledLocations([
      { label: "DREHORT", address: "Rüttenscheider Str. 2, 45128 Essen" },
      { label: "", address: "Opernring 2, 1010 Wien" },
      { label: "Etiqueta rara", address: "Goethegasse 1, 1010 Wien" },
    ]);
    expect(r.filming).toHaveLength(3);
    expect(r.dropped).toHaveLength(0);
  });

  it("nombres de escena sin dirección (sin dígitos ni comas) se descartan", () => {
    const r = classifyLabeledLocations([
      { label: "MOTIV", address: "WEINBERGE - NÄHE HAUS MAX" },
      { label: "MOTIV 2", address: "Tennisplatz" },
      { label: "SET", address: "Schloss Schönbrunn, Wien" }, // coma → se conserva
      { label: "LOC 1", address: "Opernring 2" },            // dígito → se conserva
      { label: "LOC 4", address: "Lichtenfelsgasse Ecke Rathausplatz" }, // esquina real → se conserva
    ]);
    expect(r.filming.map((f) => f.address)).toEqual([
      "Schloss Schönbrunn, Wien",
      "Opernring 2",
      "Lichtenfelsgasse Ecke Rathausplatz",
    ]);
    expect(r.dropped.map((d) => d.reason)).toEqual([
      "scene_descriptor_no_address",
      "scene_descriptor_no_address",
    ]);
  });

  it("catering/maske/office fuera; deduplica direcciones repetidas", () => {
    const r = classifyLabeledLocations([
      { label: "LOCATION 2", address: "Josefsgasse 12, 1080 Wien" },
      { label: "Catering", address: "Zelt am Set" },
      { label: "Maske / Garderobe", address: "Bus 1" },
      { label: "SET", address: "Josefsgasse 12, 1080 Wien" },
    ]);
    expect(r.filming.map((f) => f.label)).toEqual(["LOCATION 2"]);
    expect(r.dropped.map((d) => d.reason)).toEqual([
      "logistics_label:Catering",
      "logistics_label:Maske / Garderobe",
      "duplicate_address",
    ]);
  });
});
