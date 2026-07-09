import { describe, expect, it } from "vitest";
import { resolveCallsheetDate } from "./callsheetDate";

const REF = "2026-07-09T12:00:00.000Z"; // fecha de subida simulada

describe("resolveCallsheetDate", () => {
  it("respeta la fecha cuando el año está impreso en el documento", () => {
    expect(
      resolveCallsheetDate({
        date: "2024-05-06",
        dateRaw: "Montag, 06.05.2024",
        dateYearInDocument: true,
        referenceIso: REF,
      }),
    ).toBe("2024-05-06");
  });

  it("respeta la fecha si el texto literal contiene un año de 4 cifras aunque la IA no lo señale", () => {
    expect(
      resolveCallsheetDate({
        date: "2024-08-21",
        dateRaw: "Mittwoch 21.08.2024",
        dateYearInDocument: null,
        referenceIso: REF,
      }),
    ).toBe("2024-08-21");
  });

  it("corrige un año inventado usando el día de semana del texto literal", () => {
    // "Tuesday, 19th Nov" sin año: 19-nov cae en martes en 2024 (ventana ref-2..ref+1).
    // La IA se inventó 2019 (caso real de la línea base).
    expect(
      resolveCallsheetDate({
        date: "2019-11-19",
        dateRaw: "Tuesday, 19th Nov",
        dateYearInDocument: false,
        referenceIso: REF,
      }),
    ).toBe("2024-11-19");
  });

  it("sin día de semana, elige el año que acerque la fecha a la subida", () => {
    // Subida en jul-2026; 15-ene sin año → 2026-01-15 es lo más cercano.
    expect(
      resolveCallsheetDate({
        date: "2020-01-15",
        dateRaw: "15th Jan",
        dateYearInDocument: false,
        referenceIso: REF,
      }),
    ).toBe("2026-01-15");
  });

  it("callsheet de la semana siguiente (caso de producción): elige el año en curso", () => {
    expect(
      resolveCallsheetDate({
        date: "2025-07-14", // IA acertó mes/día pero puso otro año
        dateRaw: "14.07.",  // sin año ni día de semana
        dateYearInDocument: false,
        referenceIso: REF,  // 2026-07-09 → 14-jul-2026 es lo más cercano
      }),
    ).toBe("2026-07-14");
  });

  it("devuelve la fecha tal cual si no es parseable", () => {
    expect(
      resolveCallsheetDate({ date: "no-date", dateRaw: null, dateYearInDocument: null, referenceIso: REF }),
    ).toBe("no-date");
  });

  it("29 de febrero: descarta años no bisiestos de la ventana", () => {
    expect(
      resolveCallsheetDate({
        date: "2023-02-29", // inválida tal cual; la IA puso un año no bisiesto
        dateRaw: "29th Feb",
        dateYearInDocument: false,
        referenceIso: REF,
      }),
    ).toBe("2024-02-29"); // único 29-feb válido en la ventana 2024-2027
  });
});
