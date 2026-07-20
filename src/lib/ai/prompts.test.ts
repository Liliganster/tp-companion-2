import { describe, expect, it } from "vitest";

import { buildUniversalExtractorPrompt } from "./prompts";

describe("buildUniversalExtractorPrompt", () => {
  it("analyzes the full document while excluding future-day, appendix and contact sections", () => {
    const prompt = buildUniversalExtractorPrompt("[PDF ATTACHED]");

    expect(prompt).toContain("Analyze the full document");
    expect(prompt).toContain("NÄCHSTER DREHTAG");
    expect(prompt).toContain("APPENDIX");
    expect(prompt).toContain("CONTACT LIST");
    expect(prompt).toContain("Never use those excluded sections as evidence");
    expect(prompt).not.toContain("Only analyze the FIRST 2 PAGES");
  });
});
