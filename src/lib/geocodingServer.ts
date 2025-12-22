const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_SERVER_KEY;

export async function geocodeAddress(address: string) {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error("Missing GOOGLE_MAPS_SERVER_KEY");
    return null;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await fetch(url);
    const data: any = await response.json();

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const result = data.results[0];
      return {
        formatted_address: result.formatted_address,
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        place_id: result.place_id,
        quality: result.geometry.location_type
      };
    }
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}
