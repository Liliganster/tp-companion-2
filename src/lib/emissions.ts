export function calculateCO2KgFromKm(distanceKm: number): number {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km <= 0) return 0;

  // Default factor used across the app (kg CO₂ per km).
  // Keeps current behavior consistent with existing trip UI.
  const kgPerKm = 0.12;

  // Round to 1 decimal to match UI.
  return Math.round(km * kgPerKm * 10) / 10;
}
