export const NL_CENTER = { lat: 52.13, lon: 5.29 };

/** Great-circle distance in kilometres. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Rough bounding box of the Netherlands (incl. Wadden islands and Limburg). */
export function insideNetherlands(lat: number, lon: number): boolean {
  return lat >= 50.7 && lat <= 53.7 && lon >= 3.2 && lon <= 7.3;
}

export function parseCoordinate(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
