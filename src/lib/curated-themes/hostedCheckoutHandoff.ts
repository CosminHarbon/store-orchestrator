/**
 * Parent-side validation for curated-runtime → hosted checkout handoff.
 * Never trust an arbitrary URL from iframe content.
 */

export const SV_HOSTED_CHECKOUT_MESSAGE = 'sv:hosted-checkout' as const;

export type HostedCheckoutMessage = {
  type: typeof SV_HOSTED_CHECKOUT_MESSAGE;
  checkoutUrl: string;
};

/** Allow only http(s) URLs on the configured checkout origin with path `/checkout`. */
export function isAllowedHostedCheckoutUrl(
  raw: unknown,
  hostedCheckoutOrigin: string,
): raw is string {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  if (!hostedCheckoutOrigin || hostedCheckoutOrigin === 'null') return false;
  let expected: URL;
  let actual: URL;
  try {
    expected = new URL(hostedCheckoutOrigin);
    actual = new URL(raw.trim());
  } catch {
    return false;
  }
  if (actual.protocol !== 'http:' && actual.protocol !== 'https:') return false;
  if (actual.username || actual.password) return false;
  if (actual.origin !== expected.origin) return false;
  if (actual.pathname !== '/checkout' && !actual.pathname.startsWith('/checkout/')) return false;
  // Draft token must be in the query — reject bare /checkout without capability.
  if (!actual.searchParams.get('draft')) return false;
  return true;
}

export function parseHostedCheckoutMessage(data: unknown): HostedCheckoutMessage | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (o.type !== SV_HOSTED_CHECKOUT_MESSAGE) return null;
  if (typeof o.checkoutUrl !== 'string') return null;
  return { type: SV_HOSTED_CHECKOUT_MESSAGE, checkoutUrl: o.checkoutUrl };
}
