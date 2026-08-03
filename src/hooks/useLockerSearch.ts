import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STORE_API_BASE, storeApiHeaders } from '@/lib/storefront/api';
import { getCachedLockers, lockerCacheKey, setCachedLockers } from '@/lib/lockers/lockerCache';
import { haversineMeters } from '@/lib/lockers/distance';
import { isLockerOpenNow } from '@/lib/lockers/geocode';
import type { LockerFilterPrefs } from '@/lib/lockers/lockerPrefs';
import type { LockerLocation } from '@/lib/lockers/types';

export type LockerSearchError = {
  code: string;
  message: string;
};

export type UserCoords = { latitude: number; longitude: number } | null;

interface UseLockerSearchOptions {
  apiKey: string;
  carrierCode: string;
  debounceMs?: number;
  userCoords?: UserCoords;
  filters?: LockerFilterPrefs;
}

export function useLockerSearch({
  apiKey,
  carrierCode,
  debounceMs = 300,
  userCoords = null,
  filters,
}: UseLockerSearchOptions) {
  const [localityName, setLocalityName] = useState('');
  const [countyName, setCountyName] = useState('');
  const [queryFilter, setQueryFilter] = useState('');
  const [lockers, setLockers] = useState<LockerLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LockerSearchError | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [fromCache, setFromCache] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipDebounceRef = useRef(false);

  const canSearch = localityName.trim().length >= 2 && countyName.trim().length >= 2;

  const fetchLockers = useCallback(
    async (opts?: { force?: boolean; locality?: string; county?: string }) => {
      const locality = (opts?.locality ?? localityName).trim();
      const county = (opts?.county ?? countyName).trim();

      if (locality.length < 2 || county.length < 2) {
        setError({
          code: 'MISSING_LOCATION',
          message: 'Enter a city and county to find lockers.',
        });
        return;
      }

      if (!carrierCode) {
        setError({
          code: 'MISSING_CARRIER',
          message: 'Select a carrier first.',
        });
        return;
      }

      const key = lockerCacheKey({
        carrierCode,
        localityName: locality,
        countyName: county,
      });

      if (!opts?.force) {
        const cached = getCachedLockers(key);
        if (cached) {
          setLockers(cached);
          setError(null);
          setHasSearched(true);
          setFromCache(true);
          setLoading(false);
          return;
        }
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      setFromCache(false);

      try {
        const params = new URLSearchParams({
          carrier_code: carrierCode,
          locality_name: locality,
          county_name: county,
        });

        const res = await fetch(`${STORE_API_BASE}/lockers?${params.toString()}`, {
          method: 'GET',
          headers: {
            ...storeApiHeaders(apiKey),
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        const data = await res.json();

        if (!data.success) {
          setLockers([]);
          setHasSearched(true);
          setError({
            code: data.error || 'API_ERROR',
            message: data.message || 'Failed to fetch lockers',
          });
          return;
        }

        const list: LockerLocation[] = (data.lockers || []).map((l: any) => ({
          id: String(l.id),
          name: l.name || 'Locker',
          address: l.address || '',
          city: l.city || locality,
          county: l.county || county,
          latitude: Number(l.latitude),
          longitude: Number(l.longitude),
          carrier_id: Number(l.carrier_id) || Number(data.carrier?.id) || 0,
          carrier_name: l.carrier_name || data.carrier?.name || carrierCode,
          carrier_code: data.carrier?.code || carrierCode,
          available: l.available !== false && l.is_active !== false,
          allows_drop_off: l.allows_drop_off ?? null,
          payment_type: l.payment_type ?? null,
          schedule: l.schedule ?? null,
          fixed_location_type: l.fixed_location_type ?? null,
        }));

        setCachedLockers(key, list);
        setLockers(list);
        setHasSearched(true);
        setError(null);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setLockers([]);
        setHasSearched(true);
        setError({
          code: 'FETCH_ERROR',
          message: e?.message || 'Failed to load lockers',
        });
      } finally {
        setLoading(false);
      }
    },
    [apiKey, carrierCode, localityName, countyName]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (skipDebounceRef.current) {
      skipDebounceRef.current = false;
      return;
    }
    if (!canSearch) return;

    debounceRef.current = setTimeout(() => {
      void fetchLockers();
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [canSearch, localityName, countyName, carrierCode, debounceMs, fetchLockers]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const enriched = useMemo(() => {
    let list = lockers.map((l) => {
      const distance_m =
        userCoords && l.latitude && l.longitude
          ? haversineMeters(userCoords.latitude, userCoords.longitude, l.latitude, l.longitude)
          : null;
      return { ...l, distance_m };
    });

    const q = queryFilter.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.address.toLowerCase().includes(q) ||
          l.city.toLowerCase().includes(q) ||
          l.county.toLowerCase().includes(q) ||
          String(l.id).includes(q)
      );
    }

    if (filters?.dropOffOnly) {
      list = list.filter((l) => l.allows_drop_off === true);
    }
    if (filters?.openNow) {
      list = list.filter((l) => {
        const open = isLockerOpenNow(l.schedule);
        return open === true;
      });
    }
    if (filters?.maxDistanceM != null && userCoords) {
      list = list.filter((l) => l.distance_m != null && l.distance_m <= filters.maxDistanceM!);
    }

    list.sort((a, b) => {
      if (a.distance_m != null && b.distance_m != null) return a.distance_m - b.distance_m;
      if (a.distance_m != null) return -1;
      if (b.distance_m != null) return 1;
      return a.name.localeCompare(b.name);
    });

    if (filters?.nearestOnly) {
      list = list.slice(0, 8);
    }

    return list;
  }, [lockers, queryFilter, userCoords, filters]);

  const refresh = useCallback(() => {
    void fetchLockers({ force: true });
  }, [fetchLockers]);

  const searchNow = useCallback(() => {
    void fetchLockers({ force: false });
  }, [fetchLockers]);

  const setLocation = useCallback((locality: string, county: string) => {
    setCountyName(county);
    setLocalityName(locality);
  }, []);

  /**
   * Update county/city AND immediately run the same fetchLockers pipeline
   * used by the manual select flow (avoids waiting on React state + debounce).
   */
  const searchAtLocation = useCallback(
    async (locality: string, county: string, opts?: { force?: boolean }) => {
      const loc = locality.trim();
      const cou = county.trim();

      // Prevent the county/city state update from aborting this fetch via debounce
      skipDebounceRef.current = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      setCountyName(cou);
      setLocalityName(loc);
      if (loc.length < 2 || cou.length < 2) {
        setError({
          code: 'MISSING_LOCATION',
          message: 'Enter a city and county to find lockers.',
        });
        return;
      }
      await fetchLockers({ force: opts?.force ?? false, locality: loc, county: cou });
    },
    [fetchLockers]
  );

  const reset = useCallback(() => {
    setLocalityName('');
    setCountyName('');
    setQueryFilter('');
    setLockers([]);
    setError(null);
    setHasSearched(false);
    setFromCache(false);
  }, []);

  return {
    localityName,
    setLocalityName,
    countyName,
    setCountyName,
    setLocation,
    searchAtLocation,
    queryFilter,
    setQueryFilter,
    lockers: enriched,
    rawCount: lockers.length,
    loading,
    error,
    hasSearched,
    fromCache,
    canSearch,
    searchNow,
    refresh,
    reset,
    fetchLockers,
  };
}
