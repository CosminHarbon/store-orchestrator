import type { EawbCounty, EawbLocality } from './types';

type Entry<T> = { value: T; at: number };
const TTL = 30 * 60 * 1000;

const countiesCache: { entry: Entry<EawbCounty[]> | null } = { entry: null };
const byCounty = new Map<string, Entry<EawbLocality[]>>();
const searchCache = new Map<string, Entry<EawbLocality[]>>();

function fresh<T>(e: Entry<T> | null | undefined): T | null {
  if (!e) return null;
  if (Date.now() - e.at > TTL) return null;
  return e.value;
}

export function getCachedCounties(): EawbCounty[] | null {
  return fresh(countiesCache.entry);
}

export function setCachedCounties(value: EawbCounty[]): void {
  countiesCache.entry = { value, at: Date.now() };
}

export function getCachedLocalitiesForCounty(county: string): EawbLocality[] | null {
  return fresh(byCounty.get(county.trim().toLowerCase()));
}

export function setCachedLocalitiesForCounty(county: string, value: EawbLocality[]): void {
  byCounty.set(county.trim().toLowerCase(), { value, at: Date.now() });
}

export function getCachedLocalitySearch(q: string): EawbLocality[] | null {
  return fresh(searchCache.get(q.trim().toLowerCase()));
}

export function setCachedLocalitySearch(q: string, value: EawbLocality[]): void {
  searchCache.set(q.trim().toLowerCase(), { value, at: Date.now() });
}
