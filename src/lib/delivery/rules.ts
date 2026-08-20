export const CUSTOMER_NOTES_MAX = 500;

export type CoverageMode = 'romania' | 'counties' | 'localities';
export type PricingMode = 'distance' | 'order_value' | 'combined';
export type DistanceCharge = 'flat' | 'per_unit';

export type CoveredLocality = {
  county: string;
  locality: string;
};

export type DeliveryPricingSettings = {
  enabled: boolean;
  coverage_mode: CoverageMode;
  covered_counties: string[];
  covered_localities: CoveredLocality[];
  pricing_mode?: PricingMode;
  distance_charge?: DistanceCharge;
  max_distance_km?: number | null;
  origin_street?: string | null;
  origin_street_number?: string | null;
  origin_city?: string | null;
  origin_county?: string | null;
};

export type OrderValueRule = {
  id?: string;
  min_order_value: number;
  max_order_value: number | null;
  delivery_fee: number;
};

export type DeliveryPricingRule = {
  id?: string;
  county: string | null;
  locality: string | null;
  min_distance_km: number;
  max_distance_km: number;
  price_per_unit: number;
};

export function normalizePlace(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function geoScopeKey(county: string | null | undefined, locality: string | null | undefined): string {
  return `${normalizePlace(county)}||${normalizePlace(locality)}`;
}

export function sanitizeCustomerNotes(raw: unknown, max = CUSTOMER_NOTES_MAX): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

export function rangesOverlap(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number
): boolean {
  return aMin < bMax && bMin < aMax;
}

export function findOverlappingRule(
  candidate: Pick<DeliveryPricingRule, 'county' | 'locality' | 'min_distance_km' | 'max_distance_km'>,
  rules: DeliveryPricingRule[],
  ignoreId?: string
): DeliveryPricingRule | null {
  const key = geoScopeKey(candidate.county, candidate.locality);
  return (
    rules.find((rule) => {
      if (ignoreId && rule.id === ignoreId) return false;
      if (geoScopeKey(rule.county, rule.locality) !== key) return false;
      return rangesOverlap(
        Number(candidate.min_distance_km),
        Number(candidate.max_distance_km),
        Number(rule.min_distance_km),
        Number(rule.max_distance_km)
      );
    }) || null
  );
}

export function validateRuleInput(input: {
  min_distance_km: number;
  max_distance_km: number;
  price_per_unit: number;
}): string | null {
  if (!Number.isFinite(input.min_distance_km) || input.min_distance_km < 0) {
    return 'min_distance';
  }
  if (!Number.isFinite(input.max_distance_km) || input.max_distance_km <= input.min_distance_km) {
    return 'max_distance';
  }
  if (!Number.isFinite(input.price_per_unit) || input.price_per_unit < 0) {
    return 'price';
  }
  return null;
}

export function isDestinationCovered(
  settings: DeliveryPricingSettings,
  county: string,
  locality: string
): boolean {
  if (settings.coverage_mode === 'romania') return true;
  const c = normalizePlace(county);
  const l = normalizePlace(locality);
  if (settings.coverage_mode === 'counties') {
    return (settings.covered_counties || []).some((name) => normalizePlace(name) === c);
  }
  return (settings.covered_localities || []).some(
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

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function findOverlappingOrderValueRule(
  candidate: Pick<OrderValueRule, 'min_order_value' | 'max_order_value'>,
  rules: OrderValueRule[],
  ignoreId?: string
): OrderValueRule | null {
  const aMax = candidate.max_order_value == null ? 1e12 : Number(candidate.max_order_value);
  return (
    rules.find((rule) => {
      if (ignoreId && rule.id === ignoreId) return false;
      const bMax = rule.max_order_value == null ? 1e12 : Number(rule.max_order_value);
      return rangesOverlap(Number(candidate.min_order_value), aMax, Number(rule.min_order_value), bMax);
    }) || null
  );
}

export function validateOrderValueInput(input: {
  min_order_value: number;
  max_order_value: number | null;
  delivery_fee: number;
}): string | null {
  if (!Number.isFinite(input.min_order_value) || input.min_order_value < 0) return 'min_order';
  if (input.max_order_value != null && (!Number.isFinite(input.max_order_value) || input.max_order_value <= input.min_order_value)) {
    return 'max_order';
  }
  if (!Number.isFinite(input.delivery_fee) || input.delivery_fee < 0) return 'price';
  return null;
}
