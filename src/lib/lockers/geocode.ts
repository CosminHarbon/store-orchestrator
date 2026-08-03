import { ROMANIA_COUNTIES, ROMANIA_LOCATIONS } from '@/lib/romaniaLocations';
import { searchEawbLocalities } from '@/lib/localities/api';
import type { EawbLocality } from '@/lib/localities/types';

export type ReverseGeocodeResult = {
  locality: string;
  county: string;
  latitude: number;
  longitude: number;
};

export type ReverseGeocodeOptions = {
  apiKey?: string;
};

/** Strip diacritics + common RO prefixes for fuzzy matching. */
export function normalizeRoName(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ș|ş/g, 's')
    .replace(/ț|ţ/g, 't')
    .replace(/ă/g, 'a')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/^judet(ul)?\s+/i, '')
    .replace(/^municipiul\s+/i, '')
    .replace(/^orasul\s+/i, '')
    .replace(/^oras\s+/i, '')
    .replace(/^sat(ul)?\s+/i, '')
    .replace(/^comuna\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchCounty(raw: string): string | null {
  const n = normalizeRoName(raw);
  if (!n) return null;

  // Bucharest special cases from Mapbox
  if (
    n === 'bucuresti' ||
    n === 'bucharest' ||
    n === 'municipiul bucuresti' ||
    n.includes('bucuresti')
  ) {
    return 'București';
  }

  const exact = ROMANIA_COUNTIES.find((c) => normalizeRoName(c) === n);
  if (exact) return exact;

  const partial = ROMANIA_COUNTIES.find((c) => {
    const cn = normalizeRoName(c);
    return n.includes(cn) || cn.includes(n);
  });
  return partial || null;
}

function matchLocalityHardcoded(county: string, raw: string): string | null {
  const cities = ROMANIA_LOCATIONS[county] || [];
  const n = normalizeRoName(raw);
  if (!n || !cities.length) return null;

  if (county === 'București') {
    if (n.includes('sector')) {
      const sector = cities.find((c) => normalizeRoName(c) === n || n.includes(normalizeRoName(c)));
      if (sector) return sector;
    }
    if (n === 'bucuresti' || n === 'bucharest' || n.includes('bucuresti')) {
      return 'București';
    }
  }

  const exact = cities.find((c) => normalizeRoName(c) === n);
  if (exact) return exact;

  // Prefer longest partial match to avoid "Baia" matching before "Baia Mare"
  const partials = cities
    .map((c) => ({ c, cn: normalizeRoName(c) }))
    .filter(({ cn }) => n.includes(cn) || cn.includes(n))
    .sort((a, b) => b.cn.length - a.cn.length);

  return partials[0]?.c || null;
}

function scoreEawbMatch(
  candidate: EawbLocality,
  placeNorm: string,
  preferredCounty: string | null
): number {
  const nameNorm = normalizeRoName(candidate.name);
  if (!nameNorm || !placeNorm) return -1;

  let score = 0;
  if (nameNorm === placeNorm) score += 100;
  else if (nameNorm.includes(placeNorm) || placeNorm.includes(nameNorm)) score += 60;
  else return -1;

  if (preferredCounty) {
    const cNorm = normalizeRoName(candidate.county);
    const pNorm = normalizeRoName(preferredCounty);
    if (cNorm === pNorm) score += 40;
    else if (cNorm.includes(pNorm) || pNorm.includes(cNorm)) score += 15;
  }

  // Prefer longer names (more specific villages over short substrings)
  score += Math.min(nameNorm.length, 20);

  return score;
}

async function resolveViaEawb(
  apiKey: string,
  places: string[],
  preferredCounty: string | null
): Promise<{ locality: string; county: string } | null> {
  let best: { locality: string; county: string; score: number } | null = null;

  // Deduplicate place queries, prefer shorter/cleaner first tokens
  const queries = Array.from(
    new Set(
      places
        .map((p) =>
          String(p || '')
            .split(',')[0]
            .replace(/^sat(ul)?\s+/i, '')
            .replace(/^comuna\s+/i, '')
            .trim()
        )
        .filter((p) => p.length >= 2)
    )
  ).slice(0, 6);

  for (const q of queries) {
    try {
      const list = await searchEawbLocalities(apiKey, q, 50);
      const placeNorm = normalizeRoName(q);
      for (const loc of list) {
        const score = scoreEawbMatch(loc, placeNorm, preferredCounty);
        if (score < 0) continue;
        if (!best || score > best.score) {
          best = { locality: loc.name, county: loc.county || preferredCounty || '', score };
        }
      }
      // Early exit on exact county+name match
      if (best && best.score >= 140) break;
    } catch {
      /* try next query */
    }
  }

  if (!best?.locality || !best.county) return null;
  return { locality: best.locality, county: best.county };
}

function collectContextNames(feature: any): { places: string[]; regions: string[] } {
  const places: string[] = [];
  const regions: string[] = [];

  const pushPlace = (v: string) => {
    const t = String(v || '').trim();
    if (t) places.push(t);
  };
  const pushRegion = (v: string) => {
    const t = String(v || '').trim();
    if (t) regions.push(t);
  };

  pushPlace(feature?.text);
  pushPlace(feature?.place_name);

  // place_name often: "Ploiești, Prahova, Romania"
  const parts = String(feature?.place_name || '')
    .split(',')
    .map((p: string) => p.trim())
    .filter(Boolean);
  parts.forEach((p, i) => {
    if (i === 0) pushPlace(p);
    else if (!/^romania|românia|ro$/i.test(p)) pushRegion(p);
  });

  const ctx = Array.isArray(feature?.context) ? feature.context : [];
  for (const c of ctx) {
    const id = String(c?.id || '');
    const text = String(c?.text || '').trim();
    if (!text) continue;
    if (id.startsWith('region') || id.startsWith('district')) pushRegion(text);
    if (id.startsWith('place') || id.startsWith('locality')) pushPlace(text);
  }

  return { places, regions };
}

/**
 * Mapbox reverse geocode → county + locality (village OR city).
 * When apiKey is provided, resolves against official eAWB localities (includes villages).
 * Falls back to hardcoded ROMANIA_LOCATIONS city list when eAWB is unavailable.
 */
export async function reverseGeocodeRo(
  latitude: number,
  longitude: number,
  mapboxToken: string,
  signal?: AbortSignal,
  options?: ReverseGeocodeOptions
): Promise<ReverseGeocodeResult | null> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json` +
    `?types=place,locality,neighborhood,district,region&country=ro&language=ro&limit=8&access_token=${mapboxToken}`;

  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data = await res.json();
  const features = Array.isArray(data.features) ? data.features : [];
  if (!features.length) return null;

  const allPlaces: string[] = [];
  const allRegions: string[] = [];

  for (const f of features) {
    const { places, regions } = collectContextNames(f);
    allPlaces.push(...places);
    allRegions.push(...regions);
  }

  let county: string | null = null;
  for (const r of allRegions) {
    county = matchCounty(r);
    if (county) break;
  }
  // Sometimes the top feature itself is the county/region
  if (!county) {
    for (const p of allPlaces) {
      county = matchCounty(p);
      if (county) break;
    }
  }

  // Prefer official eAWB locality resolution (villages + cities)
  if (options?.apiKey) {
    const eawb = await resolveViaEawb(options.apiKey, allPlaces, county);
    if (eawb) {
      return {
        locality: eawb.locality,
        county: eawb.county,
        latitude,
        longitude,
      };
    }
  }

  if (!county) return null;

  let locality: string | null = null;
  for (const p of allPlaces) {
    locality = matchLocalityHardcoded(county, p);
    if (locality) break;
  }

  // Ilfov vs București: if GPS is in Bucharest area but only Ilfov matched, try București cities
  if (!locality && (county === 'Ilfov' || county === 'București')) {
    for (const tryCounty of ['București', 'Ilfov']) {
      for (const p of allPlaces) {
        const m = matchLocalityHardcoded(tryCounty, p);
        if (m) {
          county = tryCounty;
          locality = m;
          break;
        }
      }
      if (locality) break;
    }
  }

  if (!locality || !county) return null;
  return { locality, county, latitude, longitude };
}

/** Parse schedule object for "open now" heuristic (RO timezone approx). */
export function isLockerOpenNow(schedule: Record<string, string> | string | null | undefined): boolean | null {
  if (!schedule) return null;
  if (typeof schedule === 'string') return null;

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const now = new Date();
  const dayKey = days[now.getDay()];
  const entry =
    schedule[dayKey] ||
    schedule[dayKey.slice(0, 3)] ||
    schedule[Object.keys(schedule).find((k) => k.toLowerCase().startsWith(dayKey.slice(0, 3))) || ''];

  if (!entry || /closed|închis|inchis/i.test(entry)) return false;

  const match = String(entry).match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= start && mins <= end;
}
