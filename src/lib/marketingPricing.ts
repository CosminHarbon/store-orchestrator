/**
 * Marketing pricing — edit these values when ready.
 * Leave empty string to show the "price coming soon" placeholder in the UI.
 */
export const MARKETING_PRICING = {
  monthly: '' as string,
  yearly: '' as string,
  /** Optional one-time store setup fee display; empty = configurable / TBD copy */
  setupFee: '' as string,
} as const;

export function hasPrice(value: string | undefined | null): boolean {
  return Boolean(value && value.trim().length > 0);
}
