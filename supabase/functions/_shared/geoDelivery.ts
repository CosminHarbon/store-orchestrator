export const CUSTOMER_NOTES_MAX = 500;

export type CoverageMode = 'romania' | 'counties' | 'localities';
export type PricingMode = 'distance' | 'order_value' | 'combined';
export type DistanceCharge = 'flat' | 'per_unit';

export type CoveredLocality = {
  county: string;
  locality: string;
};

export type DeliveryPricingSettings = {
  enabled?: boolean;
  coverage_mode?: CoverageMode | string;
  covered_counties?: string[] | null;
  covered_localities?: CoveredLocality[] | null;
  pricing_mode?: PricingMode | string;
  distance_charge?: DistanceCharge | string;
  max_distance_km?: number | string | null;
  origin_street?: string | null;
  origin_street_number?: string | null;
  origin_city?: string | null;
  origin_county?: string | null;
};

export type DeliveryPricingRule = {
  id?: string;
  county: string | null;
  locality: string | null;
  min_distance_km: number;
  max_distance_km: number;
  price_per_unit: number;
};

export type OrderValueRule = {
  id?: string;
  min_order_value: number;
  max_order_value: number | null;
  delivery_fee: number;
};

export type DeliveryQuoteResult = {
  available: boolean;
  error?: string;
  delivery_fee?: number;
  distance_km?: number;
  quantity?: number;
  price_per_unit?: number;
  charge_mode?: DistanceCharge;
  county?: string;
  locality?: string;
  rule_id?: string | null;
  snapshot?: Record<string, unknown>;
};

function normalizePlace(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function sanitizeCustomerNotes(raw: unknown, max = CUSTOMER_NOTES_MAX): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function applyChargeMode(fee: number, quantity: number, charge: string): number {
  const base = roundMoney(Number(fee) || 0);
  if (charge === 'per_unit') {
    const qty = Math.max(0, Math.floor(Number(quantity) || 0));
    return roundMoney(base * qty);
  }
  return base;
}

function resolveChargeMode(
  settings: DeliveryPricingSettings | null | undefined,
  shippingProvider?: string | null
): DistanceCharge {
  if (settings?.distance_charge === 'per_unit' || settings?.distance_charge === 'flat') {
    return settings.distance_charge;
  }
  return shippingProvider === 'manual' ? 'flat' : 'per_unit';
}

function parseCoveredLocalities(raw: unknown): CoveredLocality[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const county = String((item as CoveredLocality).county || '').trim();
      const locality = String((item as CoveredLocality).locality || '').trim();
      if (!county || !locality) return null;
      return { county, locality };
    })
    .filter((item): item is CoveredLocality => !!item);
}

export function isDestinationCovered(
  settings: DeliveryPricingSettings | null | undefined,
  county: string,
  locality: string
): boolean {
  if (!settings) return false;
  const mode = settings.coverage_mode || 'romania';
  if (mode === 'romania') return true;
  const c = normalizePlace(county);
  const l = normalizePlace(locality);
  if (mode === 'counties') {
    return (settings.covered_counties || []).some((name) => normalizePlace(name) === c);
  }
  return parseCoveredLocalities(settings.covered_localities).some(
    (item) => normalizePlace(item.county) === c && normalizePlace(item.locality) === l
  );
}

function ruleSpecificity(rule: DeliveryPricingRule): number {
  if (rule.locality) return 3;
  if (rule.county) return 2;
  return 1;
}

function matchesGeo(rule: DeliveryPricingRule, county: string, locality: string): boolean {
  const c = normalizePlace(county);
  const l = normalizePlace(locality);
  if (rule.locality) {
    return normalizePlace(rule.county) === c && normalizePlace(rule.locality) === l;
  }
  if (rule.county) {
    return normalizePlace(rule.county) === c && !rule.locality;
  }
  return !rule.county && !rule.locality;
}

export function selectDeliveryRule(
  rules: DeliveryPricingRule[],
  county: string,
  locality: string,
  distanceKm: number
): DeliveryPricingRule | null {
  const matches = rules.filter((rule) => {
    if (!matchesGeo(rule, county, locality)) return false;
    const min = Number(rule.min_distance_km);
    const max = Number(rule.max_distance_km);
    return distanceKm >= min && distanceKm <= max;
  });

  matches.sort((a, b) => {
    const spec = ruleSpecificity(b) - ruleSpecificity(a);
    if (spec) return spec;
    const minDiff = Number(b.min_distance_km) - Number(a.min_distance_km);
    if (minDiff) return minDiff;
    const maxDiff = Number(a.max_distance_km) - Number(b.max_distance_km);
    if (maxDiff) return maxDiff;
    return Number(a.price_per_unit) - Number(b.price_per_unit);
  });

  return matches[0] || null;
}

export function selectOrderValueRule(
  rules: OrderValueRule[],
  orderSubtotal: number
): OrderValueRule | null {
  const amount = Number(orderSubtotal) || 0
  const matches = (rules || []).filter((rule) => {
    const min = Number(rule.min_order_value) || 0
    const max = rule.max_order_value == null ? null : Number(rule.max_order_value)
    if (amount < min) return false
    if (max != null && Number.isFinite(max) && amount > max) return false
    return true
  })
  matches.sort((a, b) => {
    const minDiff = Number(b.min_order_value) - Number(a.min_order_value)
    if (minDiff) return minDiff
    const aMax = a.max_order_value == null ? Number.POSITIVE_INFINITY : Number(a.max_order_value)
    const bMax = b.max_order_value == null ? Number.POSITIVE_INFINITY : Number(b.max_order_value)
    return aMax - bMax
  })
  return matches[0] || null
}

export function buildOriginAddress(
  profile: {
    eawb_street?: string | null;
    eawb_street_number?: string | null;
    eawb_city?: string | null;
    eawb_county?: string | null;
    eawb_address?: string | null;
  },
  settings?: DeliveryPricingSettings | null,
): string {
  const street = settings?.origin_street || profile.eawb_street
  const number = settings?.origin_street_number || profile.eawb_street_number
  const city = settings?.origin_city || profile.eawb_city
  const county = settings?.origin_county || profile.eawb_county
  const structured = [street, number, city, county, 'Romania']
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ')

  if (city || county || street) {
    return structured
  }
  return String(profile.eawb_address || '').trim()
}

export function buildDestinationAddress(input: {
  street?: string | null;
  street_number?: string | null;
  city?: string | null;
  county?: string | null;
}): string {
  return [input.street, input.street_number, input.city, input.county, 'Romania']
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
}

type GeoPoint = { lat: number; lon: number };

async function geocodeAddress(query: string, token: string): Promise<GeoPoint | null> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${encodeURIComponent(token)}&country=ro&limit=1&language=ro`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const center = data?.features?.[0]?.center;
  if (!Array.isArray(center) || center.length < 2) return null;
  const lon = Number(center[0]);
  const lat = Number(center[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function drivingDistanceKm(origin: GeoPoint, dest: GeoPoint, token: string): Promise<number | null> {
  const coords = `${origin.lon},${origin.lat};${dest.lon},${dest.lat}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?access_token=${encodeURIComponent(token)}&overview=false&alternatives=false`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const meters = Number(data?.routes?.[0]?.distance);
  if (!Number.isFinite(meters) || meters < 0) return null;
  return Math.round((meters / 1000) * 100) / 100;
}

export async function calculateDeliveryQuote(input: {
  settings: DeliveryPricingSettings | null;
  rules: DeliveryPricingRule[];
  orderValueRules?: OrderValueRule[];
  originAddress: string;
  destination: {
    street?: string | null;
    street_number?: string | null;
    city: string;
    county: string;
  };
  quantity: number;
  orderSubtotal?: number;
  mapboxToken: string;
  shippingProvider?: string | null;
}): Promise<DeliveryQuoteResult> {
  const county = String(input.destination.county || '').trim();
  const locality = String(input.destination.city || '').trim();
  const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
  const orderSubtotal = roundMoney(Number(input.orderSubtotal) || 0);
  const pricingMode = (input.settings?.pricing_mode || 'distance') as string;
  const distanceCharge = resolveChargeMode(input.settings, input.shippingProvider);
  const maxDistance = input.settings?.max_distance_km != null && input.settings.max_distance_km !== ''
    ? Number(input.settings.max_distance_km)
    : null;
  const needsDistance = pricingMode !== 'order_value' || (maxDistance != null && Number.isFinite(maxDistance));
  const manual = input.shippingProvider === 'manual';

  if (!input.settings?.enabled) {
    return { available: false, error: 'CUSTOM_PRICING_DISABLED' };
  }
  if (!county || !locality) {
    return { available: false, error: 'ADDRESS_INCOMPLETE' };
  }
  if (!isDestinationCovered(input.settings, county, locality)) {
    return { available: false, error: 'OUT_OF_COVERAGE', county, locality };
  }

  let distanceKm: number | null = null;
  if (needsDistance) {
    if (!input.originAddress) {
      return { available: false, error: 'ORIGIN_MISSING', county, locality };
    }
    if (!input.mapboxToken) {
      return { available: false, error: 'DISTANCE_UNAVAILABLE', county, locality };
    }

    const destAddress = buildDestinationAddress({
      street: input.destination.street,
      street_number: input.destination.street_number,
      city: locality,
      county,
    });

    let origin: GeoPoint | null = null;
    let dest: GeoPoint | null = null;
    try {
      ;[origin, dest] = await Promise.all([
        geocodeAddress(input.originAddress, input.mapboxToken),
        geocodeAddress(destAddress, input.mapboxToken),
      ]);
    } catch {
      return { available: false, error: 'DISTANCE_UNAVAILABLE', county, locality };
    }

    if (!origin || !dest) {
      return { available: false, error: 'DISTANCE_UNAVAILABLE', county, locality };
    }

    try {
      distanceKm = await drivingDistanceKm(origin, dest, input.mapboxToken);
    } catch {
      return { available: false, error: 'DISTANCE_UNAVAILABLE', county, locality };
    }

    if (distanceKm == null) {
      return { available: false, error: 'DISTANCE_UNAVAILABLE', county, locality };
    }

    if (maxDistance != null && Number.isFinite(maxDistance) && distanceKm > maxDistance) {
      return {
        available: false,
        error: 'TOO_FAR',
        county,
        locality,
        distance_km: distanceKm,
        quantity,
      };
    }
  }

  const orderRule = selectOrderValueRule(input.orderValueRules || [], orderSubtotal);
  const distanceRule = distanceKm == null
    ? null
    : selectDeliveryRule(input.rules || [], county, locality, distanceKm);

  let deliveryFee: number | null = null;
  let pricePerUnit = 0;
  let ruleId: string | null = null;
  let method = 'custom_geographic';

  if (pricingMode === 'order_value') {
    if (!orderRule) {
      return { available: false, error: 'NO_RULE', county, locality, distance_km: distanceKm ?? undefined, quantity };
    }
    pricePerUnit = roundMoney(Number(orderRule.delivery_fee));
    deliveryFee = applyChargeMode(pricePerUnit, quantity, distanceCharge);
    ruleId = orderRule.id || null;
    method = 'order_value';
  } else if (pricingMode === 'combined') {
    if (!distanceRule) {
      return { available: false, error: 'NO_RULE', county, locality, distance_km: distanceKm ?? undefined, quantity };
    }
    pricePerUnit = roundMoney(Number(distanceRule.price_per_unit));
    deliveryFee = applyChargeMode(pricePerUnit, quantity, distanceCharge);
    ruleId = distanceRule.id || null;
    method = 'combined';
    if (orderRule) {
      pricePerUnit = roundMoney(Number(orderRule.delivery_fee));
      deliveryFee = applyChargeMode(pricePerUnit, quantity, distanceCharge);
      method = 'combined_order_override';
    }
  } else {
    if (!distanceRule) {
      return { available: false, error: 'NO_RULE', county, locality, distance_km: distanceKm ?? undefined, quantity };
    }
    pricePerUnit = roundMoney(Number(distanceRule.price_per_unit));
    deliveryFee = applyChargeMode(pricePerUnit, quantity, distanceCharge);
    ruleId = distanceRule.id || null;
    method = manual ? 'manual_distance' : 'custom_geographic';
  }

  const snapshot = {
    method,
    provider: manual ? 'manual' : 'eawb',
    pricing_mode: pricingMode,
    distance_charge: distanceCharge,
    coverage_mode: input.settings.coverage_mode || 'romania',
    county,
    locality,
    distance_km: distanceKm,
    max_distance_km: maxDistance,
    quantity,
    order_subtotal: orderSubtotal,
    price_per_unit: pricePerUnit,
    delivery_fee: deliveryFee,
    rule_id: ruleId,
    order_rule: orderRule
      ? {
          min_order_value: Number(orderRule.min_order_value),
          max_order_value: orderRule.max_order_value == null ? null : Number(orderRule.max_order_value),
          delivery_fee: roundMoney(Number(orderRule.delivery_fee)),
        }
      : null,
    distance_rule: distanceRule
      ? {
          county: distanceRule.county,
          locality: distanceRule.locality,
          min_distance_km: Number(distanceRule.min_distance_km),
          max_distance_km: Number(distanceRule.max_distance_km),
          price_per_unit: roundMoney(Number(distanceRule.price_per_unit)),
        }
      : null,
  };

  return {
    available: true,
    delivery_fee: deliveryFee,
    distance_km: distanceKm ?? undefined,
    quantity,
    price_per_unit: pricePerUnit,
    charge_mode: distanceCharge,
    county,
    locality,
    rule_id: ruleId,
    snapshot,
  };
}
