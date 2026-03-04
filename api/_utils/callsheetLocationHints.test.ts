import { describe, expect, it } from "vitest";

import {
  buildCallsheetPdfHintText,
  extractLabeledLocationCandidates,
  extractVenueCandidates,
  normalizeExtractedCallsheetLocations,
} from "./callsheetLocationHints";

describe("callsheetLocationHints", () => {
  it("extracts explicit venue markers from pdf text", () => {
    const pdfText = [
      "SET = Location",
      "Location 1",
      "@Le Meridien https://maps.app.goo.gl/J1PS52KfzuaCDhKZ6",
      "Your Bar im Erdgeschoss - siehe Plan",
    ].join("\n");

    expect(extractVenueCandidates(pdfText)).toEqual(["Le Meridien"]);
  });

  it("keeps relevant location lines from the pdf text", () => {
    const pdfText = [
      "Random header",
      "Location 1",
      "@Le Meridien https://maps.app.goo.gl/J1PS52KfzuaCDhKZ6",
      "Your Bar im Erdgeschoss - siehe Plan",
      "Other notes",
    ].join("\n");

    const hints = buildCallsheetPdfHintText(pdfText);
    expect(hints).toContain("Location 1");
    expect(hints).toContain("@Le Meridien");
  });

  it("extracts locations from explicit labels and ignores lunch rows", () => {
    const pdfText = [
      "SET = Location | Adresse",
      "Location 1 | @Le Meridien https://maps.app.goo.gl/J1PS52KfzuaCDhKZ6",
      "Your Bar im Erdgeschoss - siehe Plan",
      "Lunch: | Stock -1: Keller im Velvet - siehe Plan @Le Meridien",
      "Drehort: Robert-Stolz-Platz 1, 1010 Wien",
    ].join("\n");

    const labeled = extractLabeledLocationCandidates(pdfText);

    expect(labeled).toEqual([
      "@Le Meridien",
      "Robert-Stolz-Platz 1, 1010 Wien",
    ]);
  });

  it("normalizes internal room labels back to the venue when pdf text provides a single venue", () => {
    const pdfText = [
      "Location 1",
      "@Le Meridien https://maps.app.goo.gl/J1PS52KfzuaCDhKZ6",
      "Your Bar im Erdgeschoss - siehe Plan",
      "Location 2",
      "Foyer im Erdgeschoss - siehe Plan @Le Meridien",
    ].join("\n");

    const normalized = normalizeExtractedCallsheetLocations({
      locations: [
        "Your Bar im Erdgeschoss - siehe Plan",
        "Foyer im Erdgeschoss - siehe Plan @Le Meridien https://maps.app.goo.gl/J1PS52KfzuaCDhKZ6",
      ],
      pdfText,
    });

    expect(normalized).toEqual(["Le Meridien"]);
  });
});
