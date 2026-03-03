import { describe, expect, it } from "vitest";

import {
  shouldIgnoreObservedIncomingRequest,
  shouldIgnoreObservedOutgoingRequest,
} from "./observability.js";

describe("observability route filtering", () => {
  it("ignores noisy incoming routes for climatiq and electricity maps", () => {
    expect(shouldIgnoreObservedIncomingRequest("/api/climatiq/fuel-factor?fuelType=gasoline")).toBe(true);
    expect(shouldIgnoreObservedIncomingRequest("/api/electricity-maps/carbon-intensity?zone=AT")).toBe(true);
    expect(shouldIgnoreObservedIncomingRequest("/api/callsheets/trigger-worker")).toBe(false);
  });

  it("ignores noisy outgoing hosts for external factor providers", () => {
    expect(shouldIgnoreObservedOutgoingRequest("https://api.climatiq.io/data/v1/estimate")).toBe(true);
    expect(shouldIgnoreObservedOutgoingRequest("https://api.electricitymap.org/v3/carbon-intensity/latest?zone=AT")).toBe(true);
    expect(shouldIgnoreObservedOutgoingRequest("https://maps.googleapis.com/maps/api/geocode/json")).toBe(false);
  });
});
