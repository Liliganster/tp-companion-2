import { describe, expect, it } from "vitest";
import {
  adaptPlacesAutocompleteApiResponse,
  adaptRoutesApiResponse,
  buildPlaceDetailsApiUrl,
  buildPlacesAutocompleteApiRequest,
  buildRoutesApiRequest,
  parseGoogleDurationSeconds,
} from "./googleMapsNew";

describe("Google Maps new API adapters", () => {
  it("builds an address-based Routes API request", () => {
    expect(buildRoutesApiRequest({
      origin: " Wien ",
      destination: "Graz",
      waypoints: [" St. Poelten "],
      region: "at",
      language: "de",
    })).toEqual(expect.objectContaining({
      origin: { address: "Wien" },
      destination: { address: "Graz" },
      intermediates: [{ address: "St. Poelten" }],
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      regionCode: "at",
      languageCode: "de",
    }));
  });

  it("adapts Routes API distance, traffic, bounds, legs and polyline", () => {
    const result = adaptRoutesApiResponse({
      routes: [{
        distanceMeters: 12_345,
        duration: "905.4s",
        staticDuration: "840s",
        polyline: { encodedPolyline: "encoded" },
        viewport: {
          low: { latitude: 47.1, longitude: 15.1 },
          high: { latitude: 48.2, longitude: 16.2 },
        },
        legs: [{
          distanceMeters: 12_345,
          duration: "905.4s",
          staticDuration: "840s",
          startLocation: { latLng: { latitude: 48.1, longitude: 16.1 } },
          endLocation: { latLng: { latitude: 47.1, longitude: 15.1 } },
        }],
      }],
    });

    expect(result).toEqual({
      overviewPolyline: "encoded",
      bounds: {
        southwest: { lat: 47.1, lng: 15.1 },
        northeast: { lat: 48.2, lng: 16.2 },
      },
      legs: [{
        startLocation: { lat: 48.1, lng: 16.1 },
        endLocation: { lat: 47.1, lng: 15.1 },
        distanceMeters: 12_345,
        durationSeconds: 840,
        durationInTrafficSeconds: 905,
      }],
      totalDistanceMeters: 12_345,
    });
  });

  it("parses protobuf durations and rejects invalid values", () => {
    expect(parseGoogleDurationSeconds("3.5s")).toBe(4);
    expect(parseGoogleDurationSeconds("soon")).toBeNull();
  });

  it("maps legacy autocomplete inputs to Places API New", () => {
    expect(buildPlacesAutocompleteApiRequest({
      input: " Stephansplatz ",
      components: "country:AT",
      region: "at",
      language: "de",
      sessionToken: "session-123",
      location: "48.2082, 16.3738",
      radius: 2_000,
      strictBounds: true,
    })).toEqual({
      input: "Stephansplatz",
      languageCode: "de",
      regionCode: "at",
      includedRegionCodes: ["at"],
      sessionToken: "session-123",
      locationRestriction: {
        circle: { center: { latitude: 48.2082, longitude: 16.3738 }, radius: 2_000 },
      },
    });
  });

  it("adapts place suggestions and ignores query predictions", () => {
    expect(adaptPlacesAutocompleteApiResponse({
      suggestions: [
        { placePrediction: { placeId: "place-1", text: { text: "Stephansplatz, Wien" } } },
        { queryPrediction: { text: { text: "unusable query" } } },
      ],
    })).toEqual({ predictions: [{ description: "Stephansplatz, Wien", placeId: "place-1" }] });
  });

  it("builds a field-safe Place Details URL", () => {
    expect(buildPlaceDetailsApiUrl("place/id", { language: "de", region: "at", sessionToken: "session-123" }))
      .toBe("https://places.googleapis.com/v1/places/place%2Fid?languageCode=de&regionCode=at&sessionToken=session-123");
  });
});
