const NATIVE_HOST = 'stripe-connect';
const ALLOWED_OUTCOMES = new Set(['success', 'error']);
const ALLOWED_REASONS = new Set([
  'denied',
  'state_invalid',
  'mode_mismatch',
  'account_in_use',
  'server_error',
]);

export type StripeConnectReturn = {
  outcome: 'success' | 'error';
  reason?: string;
};

function isAllowedNativeUrl(url: URL): boolean {
  const protocol = url.protocol.replace(/:$/, '');
  if (protocol !== 'com.speedvendors' && protocol !== 'com.speedvendors.app') {
    return false;
  }
  const host = (url.hostname || url.host || '').replace(/:\d+$/, '');
  const pathHead = url.pathname.replace(/^\//, '').split('/')[0];
  return host === NATIVE_HOST || pathHead === NATIVE_HOST;
}

export function parseStripeConnectReturnUrl(raw: string): StripeConnectReturn | null {
  try {
    const url = new URL(raw);
    const fromQuery = url.searchParams.get('stripe_connect');
    if (fromQuery && ALLOWED_OUTCOMES.has(fromQuery)) {
      const isWebApp =
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        url.pathname.replace(/\/$/, '') === '/app';
      if (!isWebApp && !isAllowedNativeUrl(url)) return null;
      const reason = url.searchParams.get('reason') || undefined;
      return {
        outcome: fromQuery as 'success' | 'error',
        reason: reason && ALLOWED_REASONS.has(reason) ? reason : undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
}
