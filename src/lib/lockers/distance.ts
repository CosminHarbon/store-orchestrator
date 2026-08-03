/** Haversine distance + travel estimates (no external routing required). */

const EARTH_M = 6371000;
const WALK_M_PER_MIN = 80; // ~4.8 km/h
const DRIVE_M_PER_MIN = 400; // ~24 km/h urban estimate

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

export function estimateWalkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / WALK_M_PER_MIN));
}

export function estimateDriveMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / DRIVE_M_PER_MIN));
}

export function formatTravelSummary(meters: number): {
  distanceLabel: string;
  walkLabel: string;
  driveLabel: string;
  walkMinutes: number;
  driveMinutes: number;
} {
  const walkMinutes = estimateWalkMinutes(meters);
  const driveMinutes = estimateDriveMinutes(meters);
  return {
    distanceLabel: formatDistance(meters),
    walkLabel: `${walkMinutes} min walk`,
    driveLabel: `~${driveMinutes} min drive`,
    walkMinutes,
    driveMinutes,
  };
}
