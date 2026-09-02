import {
  SPEEDVENDORS_PLANS,
  yearlyMonthlyEquivalentRon,
  type BillingInterval,
  type SpeedVendorsTier,
} from '@shared/speedvendorsPlans';

/** @deprecated Use SPEEDVENDORS_PLANS. Kept so older imports still type-check. */
export const MARKETING_PRICING = {
  monthly: `${SPEEDVENDORS_PLANS.start.monthlyAmountRon} lei`,
  yearly: `${SPEEDVENDORS_PLANS.start.yearlyAmountRon} lei`,
  setupFee: '' as string,
} as const;

export function hasPrice(value: string | undefined | null): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function formatLei(amount: number): string {
  if (Number.isInteger(amount)) return `${amount} lei`;
  return `${amount.toFixed(2)} lei`;
}

export function advertisedPrice(tier: SpeedVendorsTier, interval: BillingInterval): string {
  const plan = SPEEDVENDORS_PLANS[tier];
  return interval === 'yearly' ? formatLei(plan.yearlyAmountRon) : formatLei(plan.monthlyAmountRon);
}

export function advertisedMonthlyEquivalent(tier: SpeedVendorsTier): string {
  return formatLei(yearlyMonthlyEquivalentRon(tier));
}
