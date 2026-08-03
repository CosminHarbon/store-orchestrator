import type { LockerLocation } from './types';

type CacheEntry = {
  lockers: LockerLocation[];
  fetchedAt: number;
};

const TTL_MS = 15 * 60 * 1000; // 15 minutes
const store = new Map<string, CacheEntry>();

export function lockerCacheKey(params: {
  carrierCode: string;
  localityName: string;
  countyName: string;
}): string {
  return [
    params.carrierCode.trim().toLowerCase(),
    params.countyName.trim().toLowerCase(),
    params.localityName.trim().toLowerCase(),
  ].join('|');
}

export function getCachedLockers(key: string): LockerLocation[] | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.lockers;
}

export function setCachedLockers(key: string, lockers: LockerLocation[]): void {
  store.set(key, { lockers, fetchedAt: Date.now() });
}

export function clearLockerCache(): void {
  store.clear();
}
