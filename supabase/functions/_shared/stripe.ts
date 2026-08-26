/** Stripe Connect helpers for Edge Functions. Never log secrets, codes, or tokens. */

export const STRIPE_OAUTH_AUTHORIZE_URL = 'https://connect.stripe.com/oauth/authorize';
export const STRIPE_OAUTH_TOKEN_URL = 'https://connect.stripe.com/oauth/token';
export const STRIPE_OAUTH_DEAUTHORIZE_URL = 'https://connect.stripe.com/oauth/deauthorize';
export const STRIPE_API_BASE = 'https://api.stripe.com/v1';

export type StripeConnectSecrets = {
  secretKey: string;
  clientId: string;
  livemode: boolean;
};

export function getStripeConnectSecrets(): StripeConnectSecrets {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim() || '';
  const clientId = Deno.env.get('STRIPE_CONNECT_CLIENT_ID')?.trim() || '';
  if (!secretKey || !clientId) {
    throw new Error('STRIPE_NOT_CONFIGURED');
  }
  if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
    throw new Error('STRIPE_NOT_CONFIGURED');
  }
  if (!clientId.startsWith('ca_')) {
    throw new Error('STRIPE_NOT_CONFIGURED');
  }
  return {
    secretKey,
    clientId,
    livemode: secretKey.startsWith('sk_live_'),
  };
}

function basicAuthHeader(secretKey: string): string {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

export function buildOAuthAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(STRIPE_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('scope', 'read_write');
  url.searchParams.set('state', params.state);
  url.searchParams.set('redirect_uri', params.redirectUri);
  return url.toString();
}

export type StripeOAuthTokenResponse = {
  stripe_user_id: string;
  livemode: boolean;
  scope?: string;
  token_type?: string;
};

/**
 * Stripe documents POST /oauth/token as non-idempotent: consuming the same
 * authorization code more than once can revoke the connection.
 * This isolate set plus a single fetch (no retry loop) enforces one attempt.
 */
const oauthTokenExchangeAttempts = new Set<string>();

/** One POST. Never retry — not on network errors, HTTP errors, or parse failures. */
async function fetchOAuthTokenOnce(secretKey: string, code: string): Promise<Response> {
  return await fetch(STRIPE_OAUTH_TOKEN_URL, {
    method: 'POST',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      Authorization: basicAuthHeader(secretKey),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
    }),
  });
}

export async function exchangeOAuthCode(
  secretKey: string,
  code: string,
): Promise<StripeOAuthTokenResponse> {
  if (!code || oauthTokenExchangeAttempts.has(code)) {
    console.error('stripe oauth token refused: missing or already attempted code');
    throw new Error('OAUTH_TOKEN_FAILED');
  }
  oauthTokenExchangeAttempts.add(code);

  let response: Response;
  try {
    response = await fetchOAuthTokenOnce(secretKey, code);
  } catch (err) {
    console.error('stripe oauth token network error', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    throw new Error('OAUTH_TOKEN_FAILED');
  }

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const err = typeof payload.error === 'string' ? payload.error : 'oauth_token_failed';
    console.error('stripe oauth token failed', { error: err, status: response.status });
    throw new Error('OAUTH_TOKEN_FAILED');
  }

  const stripeUserId = typeof payload.stripe_user_id === 'string' ? payload.stripe_user_id : '';
  if (!stripeUserId.startsWith('acct_')) {
    console.error('stripe oauth token missing stripe_user_id');
    throw new Error('OAUTH_TOKEN_FAILED');
  }

  return {
    stripe_user_id: stripeUserId,
    livemode: payload.livemode === true,
    scope: typeof payload.scope === 'string' ? payload.scope : undefined,
    token_type: typeof payload.token_type === 'string' ? payload.token_type : undefined,
  };
}

export type StripeAccountSnapshot = {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  disabled_reason: string | null;
};

export async function retrieveConnectedAccount(
  secretKey: string,
  accountId: string,
): Promise<StripeAccountSnapshot> {
  const response = await fetch(`${STRIPE_API_BASE}/accounts/${encodeURIComponent(accountId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const err = typeof payload.error === 'object' && payload.error
      ? (payload.error as { type?: string }).type
      : 'account_retrieve_failed';
    console.error('stripe account retrieve failed', { error: err, status: response.status });
    throw new Error('ACCOUNT_RETRIEVE_FAILED');
  }

  const requirements = payload.requirements as { disabled_reason?: string | null } | undefined;
  return {
    id: String(payload.id || accountId),
    charges_enabled: payload.charges_enabled === true,
    payouts_enabled: payload.payouts_enabled === true,
    details_submitted: payload.details_submitted === true,
    disabled_reason: requirements?.disabled_reason ? String(requirements.disabled_reason) : null,
  };
}

/**
 * Confirmed Stripe deauthorization only.
 * Docs: success body includes stripe_user_id. Errors are invalid_request / invalid_client
 * (invalid_client has several causes — never treat it as already disconnected).
 * Do not parse error_description. Do not retry.
 */
export async function deauthorizeConnectedAccount(
  secretKey: string,
  clientId: string,
  stripeUserId: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(STRIPE_OAUTH_DEAUTHORIZE_URL, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Authorization: basicAuthHeader(secretKey),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        stripe_user_id: stripeUserId,
      }),
    });
  } catch (err) {
    console.error('stripe oauth deauthorize network error', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    throw new Error('DEAUTHORIZE_FAILED');
  }

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  const returnedId = typeof payload.stripe_user_id === 'string' ? payload.stripe_user_id : '';
  if (response.ok && returnedId.startsWith('acct_')) {
    return;
  }

  const error = typeof payload.error === 'string' ? payload.error : 'unknown';
  console.error('stripe oauth deauthorize failed', {
    error,
    status: response.status,
  });
  throw new Error('DEAUTHORIZE_FAILED');
}

export function integrationStatusFromAccount(account: StripeAccountSnapshot):
  'connected' | 'restricted' | 'pending_onboarding' {
  if (account.charges_enabled) return 'connected';
  if (account.details_submitted) return 'restricted';
  return 'pending_onboarding';
}
