/**
 * Canonical SpeedVendors SaaS plan catalogue.
 * Shared by the web app and billing Edge Functions.
 *
 * billing_subscriptions.plan remains monthly | yearly (interval).
 * Tier identity is start | growth | scale.
 */

export const SPEEDVENDORS_TIERS = ['start', 'growth', 'scale'] as const;
export type SpeedVendorsTier = (typeof SPEEDVENDORS_TIERS)[number];

export const BILLING_INTERVALS = ['monthly', 'yearly'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Exact byte quotas (2 / 15 / 50 GiB). Do not use SI decimal GB. */
export const MEDIA_QUOTA_BYTES = {
  start: 2147483648,
  growth: 16106127360,
  scale: 53687091200,
} as const;

export const SPEEDVENDORS_CURRENCY = 'ron' as const;
export const SPEEDVENDORS_PRODUCT_NAME = 'SpeedVendors';
/** Stripe Product tax code: Software as a service (SaaS) - business use. */
export const SPEEDVENDORS_TAX_CODE = 'txcd_10103001';
export const SPEEDVENDORS_PRICE_TAX_BEHAVIOR = 'inclusive' as const;

export type PlanDefinition = {
  id: SpeedVendorsTier;
  name: 'START' | 'GROWTH' | 'SCALE';
  rank: 0 | 1 | 2;
  monthlyAmountRon: number;
  yearlyAmountRon: number;
  mediaQuotaBytes: number;
  mediaQuotaGiB: 2 | 15 | 50;
  lookupKeys: Record<BillingInterval, string>;
  popular?: boolean;
};

export const SPEEDVENDORS_PLANS: Record<SpeedVendorsTier, PlanDefinition> = {
  start: {
    id: 'start',
    name: 'START',
    rank: 0,
    monthlyAmountRon: 99,
    yearlyAmountRon: 990,
    mediaQuotaBytes: MEDIA_QUOTA_BYTES.start,
    mediaQuotaGiB: 2,
    lookupKeys: {
      monthly: 'speedvendors_start_monthly',
      yearly: 'speedvendors_start_yearly',
    },
  },
  growth: {
    id: 'growth',
    name: 'GROWTH',
    rank: 1,
    monthlyAmountRon: 229,
    yearlyAmountRon: 2290,
    mediaQuotaBytes: MEDIA_QUOTA_BYTES.growth,
    mediaQuotaGiB: 15,
    lookupKeys: {
      monthly: 'speedvendors_growth_monthly',
      yearly: 'speedvendors_growth_yearly',
    },
    popular: true,
  },
  scale: {
    id: 'scale',
    name: 'SCALE',
    rank: 2,
    monthlyAmountRon: 449,
    yearlyAmountRon: 4490,
    mediaQuotaBytes: MEDIA_QUOTA_BYTES.scale,
    mediaQuotaGiB: 50,
    lookupKeys: {
      monthly: 'speedvendors_scale_monthly',
      yearly: 'speedvendors_scale_yearly',
    },
  },
};

export const ALL_LOOKUP_KEYS = SPEEDVENDORS_TIERS.flatMap((tier) => [
  SPEEDVENDORS_PLANS[tier].lookupKeys.monthly,
  SPEEDVENDORS_PLANS[tier].lookupKeys.yearly,
]);

/**
 * Sandbox prices from the previous two-price catalogue.
 * Treat as START so existing test subscriptions keep a known tier.
 */
export const LEGACY_SANDBOX_PRICE_MAP: Record<
  string,
  { tier: SpeedVendorsTier; interval: BillingInterval }
> = {
  price_1U9PYVCSbF3ugaFYdcxkRX1e: { tier: 'start', interval: 'monthly' },
  price_1U9PZJCSbF3ugaFYLfZNuZvO: { tier: 'start', interval: 'yearly' },
};

export function isSpeedVendorsTier(value: string | null | undefined): value is SpeedVendorsTier {
  return value === 'start' || value === 'growth' || value === 'scale';
}

export function isBillingInterval(value: string | null | undefined): value is BillingInterval {
  return value === 'monthly' || value === 'yearly';
}

export function parseTier(value: string | null | undefined): SpeedVendorsTier | null {
  const t = (value || '').trim().toLowerCase();
  return isSpeedVendorsTier(t) ? t : null;
}

export function parseInterval(value: string | null | undefined): BillingInterval | null {
  const raw = (value || '').trim().toLowerCase();
  if (raw === 'monthly' || raw === 'month') return 'monthly';
  if (raw === 'yearly' || raw === 'year' || raw === 'annual' || raw === 'annually') {
    return 'yearly';
  }
  return null;
}

export function lookupKeyFor(tier: SpeedVendorsTier, interval: BillingInterval): string {
  return SPEEDVENDORS_PLANS[tier].lookupKeys[interval];
}

export function planFromLookupKey(
  lookupKey: string | null | undefined,
): { tier: SpeedVendorsTier; interval: BillingInterval } | null {
  const key = (lookupKey || '').trim();
  if (!key) return null;
  for (const tier of SPEEDVENDORS_TIERS) {
    const plan = SPEEDVENDORS_PLANS[tier];
    if (plan.lookupKeys.monthly === key) return { tier, interval: 'monthly' };
    if (plan.lookupKeys.yearly === key) return { tier, interval: 'yearly' };
  }
  return null;
}

export function mediaQuotaBytesForTier(tier: string | null | undefined): number {
  const parsed = parseTier(tier);
  if (!parsed) return MEDIA_QUOTA_BYTES.start;
  return SPEEDVENDORS_PLANS[parsed].mediaQuotaBytes;
}

export function amountRonFor(tier: SpeedVendorsTier, interval: BillingInterval): number {
  const plan = SPEEDVENDORS_PLANS[tier];
  return interval === 'yearly' ? plan.yearlyAmountRon : plan.monthlyAmountRon;
}

/** Stripe smallest currency unit. RON has 2 decimal places. */
export function amountMinorFor(tier: SpeedVendorsTier, interval: BillingInterval): number {
  return Math.round(amountRonFor(tier, interval) * 100);
}

export function yearlyMonthlyEquivalentRon(tier: SpeedVendorsTier): number {
  return Math.round((SPEEDVENDORS_PLANS[tier].yearlyAmountRon / 12) * 100) / 100;
}

export function intervalFromStripe(interval: string | null | undefined): BillingInterval | null {
  if (interval === 'year') return 'yearly';
  if (interval === 'month') return 'monthly';
  return parseInterval(interval);
}

export function stripeIntervalFor(interval: BillingInterval): 'month' | 'year' {
  return interval === 'yearly' ? 'year' : 'month';
}

export type PlanChangeKind = 'upgrade' | 'downgrade' | 'noop';

/**
 * Higher tier always upgrades immediately.
 * Lower tier always downgrades at period end.
 * Same tier: monthly → yearly is immediate; yearly → monthly waits for period end.
 */
export function classifyPlanChange(
  from: { tier: SpeedVendorsTier; interval: BillingInterval },
  to: { tier: SpeedVendorsTier; interval: BillingInterval },
): PlanChangeKind {
  if (from.tier === to.tier && from.interval === to.interval) return 'noop';
  const fromRank = SPEEDVENDORS_PLANS[from.tier].rank;
  const toRank = SPEEDVENDORS_PLANS[to.tier].rank;
  if (toRank > fromRank) return 'upgrade';
  if (toRank < fromRank) return 'downgrade';
  if (from.interval === 'monthly' && to.interval === 'yearly') return 'upgrade';
  return 'downgrade';
}

export function priceMetadata(tier: SpeedVendorsTier, interval: BillingInterval): Record<string, string> {
  return {
    tier,
    media_quota_bytes: String(SPEEDVENDORS_PLANS[tier].mediaQuotaBytes),
    billing_interval: interval,
  };
}

export function entitlementMetadataFromPlan(params: {
  tier: SpeedVendorsTier;
  interval: BillingInterval;
  priceId: string | null;
  productId: string | null;
  subscriptionId: string;
  stripeStatus: string;
  graceUntil: string | null;
  lookupKey?: string | null;
  pendingTier?: SpeedVendorsTier | null;
  pendingInterval?: BillingInterval | null;
  pendingEffectiveAt?: string | null;
}): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    tier: params.tier,
    media_quota_bytes: SPEEDVENDORS_PLANS[params.tier].mediaQuotaBytes,
    billing_interval: params.interval,
    stripe_price_id: params.priceId,
    stripe_product_id: params.productId,
    stripe_subscription_id: params.subscriptionId,
    stripe_status: params.stripeStatus,
    grace_until: params.graceUntil,
    lookup_key: params.lookupKey || lookupKeyFor(params.tier, params.interval),
    price_id: params.priceId,
  };
  if (params.pendingTier && params.pendingInterval) {
    meta.pending_tier = params.pendingTier;
    meta.pending_interval = params.pendingInterval;
    meta.pending_effective_at = params.pendingEffectiveAt;
  }
  return meta;
}
