/** Minimal locker types for storefront picker (not full eAWB payload). */

export interface LockerLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  latitude: number;
  longitude: number;
  carrier_id: number;
  carrier_name: string;
  carrier_code: string;
  available: boolean;
  allows_drop_off?: boolean | null;
  payment_type?: string | null;
  schedule?: Record<string, string> | string | null;
  /** Present when API returns it (e.g. locker / pudo). */
  fixed_location_type?: string | null;
  /** Client-side enrichment */
  distance_m?: number | null;
}

/** Persisted selection — maps onto existing order/checkout columns. */
export interface SelectedLocker {
  fixed_location_id: string;
  carrier_id: number;
  carrier_name: string;
  carrier_code: string;
  locker_name: string;
  address: string;
  locality: string;
  county: string;
  latitude: number;
  longitude: number;
  distance_m?: number | null;
}

export function toSelectedLocker(locker: LockerLocation): SelectedLocker {
  return {
    fixed_location_id: String(locker.id),
    carrier_id: locker.carrier_id,
    carrier_name: locker.carrier_name || locker.carrier_code,
    carrier_code: locker.carrier_code,
    locker_name: locker.name,
    address: locker.address,
    locality: locker.city,
    county: locker.county,
    latitude: locker.latitude,
    longitude: locker.longitude,
    distance_m: locker.distance_m ?? null,
  };
}

export function formatLockerAddress(locker: Pick<SelectedLocker, 'address' | 'locality' | 'county'>): string {
  return [locker.address, locker.locality, locker.county].filter(Boolean).join(', ');
}

export function formatSchedule(schedule: LockerLocation['schedule']): string | null {
  if (!schedule) return null;
  if (typeof schedule === 'string') return schedule.trim() || null;
  const entries = Object.entries(schedule).filter(([, v]) => !!v);
  if (!entries.length) return null;
  return entries
    .slice(0, 3)
    .map(([day, hours]) => `${day}: ${hours}`)
    .join(' · ');
}
