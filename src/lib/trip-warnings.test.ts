import { describe, expect, it } from "vitest";
import { computeTripWarnings } from "./trip-warnings";

describe("computeTripWarnings", () => {
  it("flags zero distance, missing project, missing route, invalid date", () => {
    const out = computeTripWarnings([
      { id: "t1", date: "not-a-date", route: [], distance: 0, projectId: null },
    ]);

    const types = (out.byId.t1 ?? []).map((w) => w.type).sort();
    expect(types).toEqual(["invalid_date", "missing_project", "missing_route", "zero_distance"].sort());
  });

  it("flags duplicates by date + normalized route", () => {
    const out = computeTripWarnings([
      { id: "a", date: "2025-01-01", route: [" Madrid ", "Barcelona"], distance: 10, projectId: "p1" },
      { id: "b", date: "2025-01-01", route: ["madrid", "  barcelona "], distance: 11, projectId: "p1" },
    ]);

    expect((out.byId.a ?? []).some((w) => w.type === "duplicate")).toBe(true);
    expect((out.byId.b ?? []).some((w) => w.type === "duplicate")).toBe(true);
  });

  it("flags improbable distance", () => {
    const out = computeTripWarnings([
      { id: "x", date: "2025-01-01", route: ["A", "B"], distance: 2000, projectId: "p1" },
    ]);
    expect((out.byId.x ?? []).some((w) => w.type === "improbable_distance")).toBe(true);
  });
});

