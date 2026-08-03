import { STORE_API_BASE, storeApiHeaders } from '@/lib/storefront/api';
import {
  getCachedCounties,
  getCachedLocalitiesForCounty,
  getCachedLocalitySearch,
  setCachedCounties,
  setCachedLocalitiesForCounty,
  setCachedLocalitySearch,
} from '@/lib/localities/cache';
import type { EawbCounty, EawbLocality } from '@/lib/localities/types';

export async function fetchEawbCounties(apiKey: string): Promise<EawbCounty[]> {
  const cached = getCachedCounties();
  if (cached) return cached;

  const res = await fetch(`${STORE_API_BASE}/counties`, {
    headers: storeApiHeaders(apiKey),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to load counties');
  const list = (data.counties || []) as EawbCounty[];
  setCachedCounties(list);
  return list;
}

export async function fetchEawbLocalitiesForCounty(
  apiKey: string,
  county: string
): Promise<EawbLocality[]> {
  const key = county.trim();
  const cached = getCachedLocalitiesForCounty(key);
  if (cached) return cached;

  const params = new URLSearchParams({ county: key });
  const res = await fetch(`${STORE_API_BASE}/localities?${params}`, {
    headers: storeApiHeaders(apiKey),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to load localities');
  const list = (data.localities || []) as EawbLocality[];
  setCachedLocalitiesForCounty(key, list);
  return list;
}

export async function searchEawbLocalities(
  apiKey: string,
  query: string,
  perPage: 15 | 50 | 100 | 200 = 50
): Promise<EawbLocality[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // Postal code path
  if (/^\d{4,6}$/.test(q)) {
    const cacheKey = `postal:${q}`;
    const cached = getCachedLocalitySearch(cacheKey);
    if (cached) return cached;
    const res = await fetch(
      `${STORE_API_BASE}/postal-lookup?postal_code=${encodeURIComponent(q)}`,
      { headers: storeApiHeaders(apiKey) }
    );
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Postal lookup failed');
    const list = (data.localities || []) as EawbLocality[];
    setCachedLocalitySearch(cacheKey, list);
    return list;
  }

  const cached = getCachedLocalitySearch(q);
  if (cached) return cached;

  const params = new URLSearchParams({ q, per_page: String(perPage) });
  const res = await fetch(`${STORE_API_BASE}/localities-search?${params}`, {
    headers: storeApiHeaders(apiKey),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Locality search failed');
  const list = (data.localities || []) as EawbLocality[];
  setCachedLocalitySearch(q, list);
  return list;
}
