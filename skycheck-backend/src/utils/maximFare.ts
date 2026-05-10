export function estimateMaximFare(distanceKm: number): { min: number; max: number } {
  const base = 11;
  const perKm = 11.13;
  const raw = distanceKm <= 1 ? base : base + (distanceKm - 1) * perKm;
  const min = Math.ceil(raw);
  const max = Math.ceil(raw * 1.15);
  return { min, max };
}
