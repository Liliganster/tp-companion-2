import { describe, expect, it } from "vitest";
import { isImageCallsheetMime, isSupportedCallsheetFile, resolveCallsheetMime } from "./callsheetMime";

describe("callsheetMime", () => {
  it("resuelve el mime por la extensión de la ruta de storage", () => {
    expect(resolveCallsheetMime("user/job/FUNDBOX_Dispo DT 4.pdf")).toBe("application/pdf");
    expect(resolveCallsheetMime("user/job/dispo_whatsapp.JPG")).toBe("image/jpeg");
    expect(resolveCallsheetMime("user/job/foto.jpeg")).toBe("image/jpeg");
    expect(resolveCallsheetMime("user/job/captura.png")).toBe("image/png");
    expect(resolveCallsheetMime("user/job/iphone.HEIC")).toBe("image/heic");
  });

  it("sin extensión conocida cae al fallback y por último a PDF (jobs antiguos)", () => {
    expect(resolveCallsheetMime("user/job/document", "image/webp")).toBe("image/webp");
    expect(resolveCallsheetMime("user/job/document", "text/plain")).toBe("application/pdf");
    expect(resolveCallsheetMime("user/job/document")).toBe("application/pdf");
  });

  it("acepta PDF e imágenes; rechaza otros tipos", () => {
    expect(isSupportedCallsheetFile({ type: "application/pdf", name: "a.pdf" })).toBe(true);
    expect(isSupportedCallsheetFile({ type: "image/jpeg", name: "a.jpg" })).toBe(true);
    expect(isSupportedCallsheetFile({ type: "text/csv", name: "a.csv" })).toBe(false);
    expect(isSupportedCallsheetFile({ type: "application/zip", name: "a.zip" })).toBe(false);
  });

  it("sin mime (algunos drag&drop) decide la extensión del nombre", () => {
    expect(isSupportedCallsheetFile({ type: "", name: "dispo.png" })).toBe(true);
    expect(isSupportedCallsheetFile({ type: "", name: "dispo.txt" })).toBe(false);
  });

  it("distingue imagen de PDF", () => {
    expect(isImageCallsheetMime("image/jpeg")).toBe(true);
    expect(isImageCallsheetMime("application/pdf")).toBe(false);
  });
});
