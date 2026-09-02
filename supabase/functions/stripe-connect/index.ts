import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { resolveActingOwnerId } from '../_shared/actingAs.ts';
import {
  buildOAuthAuthorizeUrl,
  deauthorizeConnectedAccount,
  exchangeOAuthCode,
  getStripeConnectSecrets,
  integrationStatusFromAccount,
  retrieveConnectedAccount,
} from '../_shared/stripe.ts';
import {
  isEntitlementRequiredError,
  requireSpeedVendorsEntitlement,
} from '../_shared/billingEntitlement.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RETURN_TO_KEYS = ['app_payments', 'native_ios', 'native_android'] as const;
type ReturnTo = (typeof RETURN_TO_KEYS)[number];

const CALLBACK_REASONS = [
  'denied',
  'state_invalid',
  'mode_mismatch',
  'account_in_use',
  'server_error',
] as const;
type CallbackReason = (typeof CALLBACK_REASONS)[number];

type StripeConnectStateRow = {
  id: string;
  user_id: string;
  state: string;
  return_to: ReturnTo;
  expires_at: string;
  consumed_at: string | null;
};

type PaymentIntegrationRow = {
  id: string;
  user_id: string;
  provider: string;
  enabled: boolean;
  status: string;
  provider_account_id: string | null;
  livemode: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  disabled_reason: string | null;
  metadata: Record<string, unknown>;
  connected_at: string | null;
  disconnected_at: string | null;
  updated_at: string;
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function oauthCallbackRedirectUri(): string {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  if (!supabaseUrl) throw new Error('STRIPE_NOT_CONFIGURED');
  return `${supabaseUrl}/functions/v1/stripe-connect`;
}

function getAppOrigin(): string {
  const raw = (Deno.env.get('APP_ORIGIN') || '').trim();
  if (!raw) throw new Error('APP_ORIGIN_MISSING');
  const url = new URL(raw);
  const isLocalHttp =
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('APP_ORIGIN_INVALID');
  }
  return url.origin;
}

function resolveReturnLocation(returnTo: ReturnTo, outcome: 'success' | 'error', reason?: CallbackReason): string {
  const params = new URLSearchParams();
  params.set('stripe_connect', outcome);
  if (outcome === 'error' && reason) params.set('reason', reason);

  if (returnTo === 'native_ios') {
    return `com.speedvendors://stripe-connect?${params.toString()}`;
  }
  if (returnTo === 'native_android') {
    return `com.speedvendors.app://stripe-connect?${params.toString()}`;
  }
  return `${getAppOrigin()}/app?${params.toString()}`;
}

function redirectSeeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location },
  });
}

function safeRedirect(returnTo: ReturnTo | string | null | undefined, outcome: 'success' | 'error', reason?: CallbackReason): Response {
  const key: ReturnTo = RETURN_TO_KEYS.includes(returnTo as ReturnTo)
    ? (returnTo as ReturnTo)
    : 'app_payments';
  try {
    return redirectSeeOther(resolveReturnLocation(key, outcome, reason));
  } catch (err) {
    console.error('stripe-connect redirect failed', { message: (err as Error).message });
    return json({ error: 'REDIRECT_FAILED' }, 500);
  }
}

function randomState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function returnToFromPlatform(platform: unknown): ReturnTo {
  if (platform === 'ios') return 'native_ios';
  if (platform === 'android') return 'native_android';
  return 'app_payments';
}

function mergeMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  return { ...base, ...patch };
}

function publicIntegration(row: PaymentIntegrationRow | null) {
  if (!row) return null;
  return {
    provider: row.provider,
    enabled: row.enabled,
    status: row.status,
    provider_account_id: row.provider_account_id,
    livemode: row.livemode,
    charges_enabled: row.charges_enabled,
    payouts_enabled: row.payouts_enabled,
    details_submitted: row.details_submitted,
    disabled_reason: row.disabled_reason,
    connected_at: row.connected_at,
    deauthorize_failed: row.metadata?.deauthorize_failed === true,
  };
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader) {
    throw Object.assign(new Error('NOT_AUTHENTICATED'), { status: 401 });
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) {
    throw Object.assign(new Error('NOT_AUTHENTICATED'), { status: 401 });
  }
  return { user, jwt };
}

async function requireEntitledUser(req: Request) {
  const { user, jwt } = await requireUser(req);
  await requireSpeedVendorsEntitlement(admin, user.id);
  return { user, jwt };
}

async function loadStripeIntegration(userId: string): Promise<PaymentIntegrationRow | null> {
  const { data, error } = await admin
    .from('payment_integrations')
    .select(
      'id, user_id, provider, enabled, status, provider_account_id, livemode, charges_enabled, payouts_enabled, details_submitted, disabled_reason, metadata, connected_at, disconnected_at, updated_at',
    )
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .maybeSingle();
  if (error) {
    console.error('payment_integrations load failed', { message: error.message });
    throw new Error('DB_ERROR');
  }
  return (data as PaymentIntegrationRow | null) ?? null;
}

async function handleStartOAuth(req: Request): Promise<Response> {
  const { user, jwt } = await requireEntitledUser(req);
  const body = await req.json().catch(() => ({})) as {
    acting_as_user_id?: string;
    client_platform?: string;
  };
  const ownerId = await resolveActingOwnerId(admin, user, jwt, body.acting_as_user_id);
  const secrets = getStripeConnectSecrets();
  const returnTo = returnToFromPlatform(body.client_platform);
  const state = randomState();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await admin.from('stripe_connect_states').insert({
    user_id: ownerId,
    state,
    return_to: returnTo,
    expires_at: expiresAt,
  });
  if (error) {
    console.error('stripe_connect_states insert failed', { message: error.message });
    return json({ error: 'STATE_CREATE_FAILED' }, 500);
  }

  const authorizeUrl = buildOAuthAuthorizeUrl({
    clientId: secrets.clientId,
    redirectUri: oauthCallbackRedirectUri(),
    state,
  });

  console.log('stripe-connect start_oauth', { user_id: ownerId, return_to: returnTo });
  return json({ success: true, authorize_url: authorizeUrl });
}

async function handleOAuthCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const stripeError = url.searchParams.get('error') || '';

  const { data: consumed, error: consumeError } = await admin.rpc(
    'consume_stripe_connect_state',
    { p_state: state },
  );

  if (consumeError) {
    console.error('consume_stripe_connect_state failed', { message: consumeError.message });
    return safeRedirect('app_payments', 'error', 'server_error');
  }

  const stateRow = consumed as StripeConnectStateRow | null;
  if (!stateRow?.user_id) {
    console.error('stripe-connect oauth callback rejected: invalid or expired state');
    return safeRedirect('app_payments', 'error', 'state_invalid');
  }

  const returnTo = stateRow.return_to;

  if (stripeError) {
    console.log('stripe-connect oauth denied or error', { user_id: stateRow.user_id });
    return safeRedirect(returnTo, 'error', 'denied');
  }

  if (!code) {
    return safeRedirect(returnTo, 'error', 'denied');
  }

  try {
    const secrets = getStripeConnectSecrets();
    const token = await exchangeOAuthCode(secrets.secretKey, code);

    if (token.livemode !== secrets.livemode) {
      console.error('stripe-connect livemode mismatch', {
        user_id: stateRow.user_id,
        stripe_account: token.stripe_user_id,
      });
      return safeRedirect(returnTo, 'error', 'mode_mismatch');
    }

    const account = await retrieveConnectedAccount(secrets.secretKey, token.stripe_user_id);
    const status = integrationStatusFromAccount(account);
    const now = new Date().toISOString();

    const { data: existingByAccount } = await admin
      .from('payment_integrations')
      .select('id, user_id')
      .eq('provider', 'stripe')
      .eq('provider_account_id', account.id)
      .maybeSingle();

    if (existingByAccount && existingByAccount.user_id !== stateRow.user_id) {
      console.error('stripe-connect account already linked to another merchant', {
        stripe_account: account.id,
      });
      return safeRedirect(returnTo, 'error', 'account_in_use');
    }

    const payload = {
      user_id: stateRow.user_id,
      provider: 'stripe',
      enabled: true,
      status,
      provider_account_id: account.id,
      livemode: token.livemode,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      disabled_reason: account.disabled_reason,
      metadata: { deauthorize_failed: false },
      connected_at: now,
      disconnected_at: null,
      updated_at: now,
    };

    const { error: upsertError } = await admin
      .from('payment_integrations')
      .upsert(payload, { onConflict: 'user_id,provider' });

    if (upsertError) {
      if (upsertError.code === '23505') {
        return safeRedirect(returnTo, 'error', 'account_in_use');
      }
      console.error('payment_integrations upsert failed', { message: upsertError.message });
      return safeRedirect(returnTo, 'error', 'server_error');
    }

    console.log('stripe-connect connected', {
      user_id: stateRow.user_id,
      stripe_account: account.id,
      status,
      charges_enabled: account.charges_enabled,
    });
    return safeRedirect(returnTo, 'success');
  } catch (err) {
    const message = (err as Error).message;
    console.error('stripe-connect oauth callback failed', { message });
    return safeRedirect(returnTo, 'error', 'server_error');
  }
}

async function handleStatus(req: Request): Promise<Response> {
  const { user, jwt } = await requireEntitledUser(req);
  const body = await req.json().catch(() => ({})) as { acting_as_user_id?: string };
  const ownerId = await resolveActingOwnerId(admin, user, jwt, body.acting_as_user_id);
  const row = await loadStripeIntegration(ownerId);
  return json({ success: true, integration: publicIntegration(row) });
}

async function handleSetEnabled(req: Request): Promise<Response> {
  const { user, jwt } = await requireEntitledUser(req);
  const body = await req.json().catch(() => ({})) as {
    acting_as_user_id?: string;
    enabled?: boolean;
  };
  if (typeof body.enabled !== 'boolean') {
    return json({ error: 'INVALID_ENABLED' }, 400);
  }
  const ownerId = await resolveActingOwnerId(admin, user, jwt, body.acting_as_user_id);
  const existing = await loadStripeIntegration(ownerId);
  if (!existing || existing.status === 'disconnected' || !existing.provider_account_id) {
    return json({ error: 'INTEGRATION_NOT_CONNECTED' }, 409);
  }

  const { data, error } = await admin
    .from('payment_integrations')
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .eq('user_id', ownerId)
    .select(
      'id, user_id, provider, enabled, status, provider_account_id, livemode, charges_enabled, payouts_enabled, details_submitted, disabled_reason, connected_at, disconnected_at, updated_at',
    )
    .single();

  if (error || !data) {
    console.error('set_enabled failed', { message: error?.message });
    return json({ error: 'DB_ERROR' }, 500);
  }

  return json({ success: true, integration: publicIntegration(data as PaymentIntegrationRow) });
}

async function handleDisconnect(req: Request): Promise<Response> {
  const { user, jwt } = await requireEntitledUser(req);
  const body = await req.json().catch(() => ({})) as { acting_as_user_id?: string };
  const ownerId = await resolveActingOwnerId(admin, user, jwt, body.acting_as_user_id);
  const existing = await loadStripeIntegration(ownerId);

  if (!existing || existing.status === 'disconnected') {
    return json({ success: true, already_disconnected: true, integration: publicIntegration(existing) });
  }

  const now = new Date().toISOString();
  const { data: disabledRow, error: disableError } = await admin
    .from('payment_integrations')
    .update({
      enabled: false,
      metadata: mergeMetadata(existing.metadata, { deauthorize_failed: true }),
      updated_at: now,
    })
    .eq('id', existing.id)
    .eq('user_id', ownerId)
    .select(
      'id, user_id, provider, enabled, status, provider_account_id, livemode, charges_enabled, payouts_enabled, details_submitted, disabled_reason, metadata, connected_at, disconnected_at, updated_at',
    )
    .single();

  if (disableError || !disabledRow) {
    console.error('stripe disconnect disable failed', { message: disableError?.message });
    return json({ error: 'DB_ERROR' }, 500);
  }

  const accountId = existing.provider_account_id || disabledRow.provider_account_id;
  if (accountId) {
    try {
      const secrets = getStripeConnectSecrets();
      await deauthorizeConnectedAccount(secrets.secretKey, secrets.clientId, accountId);
    } catch (err) {
      console.error('stripe disconnect deauthorize failed', {
        user_id: ownerId,
        message: (err as Error).message,
      });
      return json({
        error: 'DEAUTHORIZE_FAILED',
        integration: publicIntegration(disabledRow as PaymentIntegrationRow),
      }, 502);
    }
  }

  const { data, error } = await admin
    .from('payment_integrations')
    .update({
      enabled: false,
      status: 'disconnected',
      provider_account_id: null,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      disabled_reason: null,
      metadata: mergeMetadata(existing.metadata, { deauthorize_failed: false }),
      disconnected_at: now,
      updated_at: now,
    })
    .eq('id', existing.id)
    .eq('user_id', ownerId)
    .select(
      'id, user_id, provider, enabled, status, provider_account_id, livemode, charges_enabled, payouts_enabled, details_submitted, disabled_reason, metadata, connected_at, disconnected_at, updated_at',
    )
    .single();

  if (error || !data) {
    console.error('stripe disconnect finalize failed', { message: error?.message });
    return json({ error: 'DB_ERROR' }, 500);
  }

  console.log('stripe-connect disconnected', { user_id: ownerId });
  return json({ success: true, integration: publicIntegration(data as PaymentIntegrationRow) });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method === 'GET') {
      return await handleOAuthCallback(req);
    }

    if (req.method !== 'POST') {
      return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    }

    const body = await req.clone().json().catch(() => ({})) as { action?: string };
    switch (body.action) {
      case 'start_oauth':
        return await handleStartOAuth(req);
      case 'status':
        return await handleStatus(req);
      case 'set_enabled':
        return await handleSetEnabled(req);
      case 'disconnect':
        return await handleDisconnect(req);
      default:
        return json({ error: 'UNKNOWN_ACTION' }, 400);
    }
  } catch (err) {
    if (isEntitlementRequiredError(err)) {
      return json({ error: 'entitlement_required' }, 403);
    }
    const message = (err as Error).message || 'SERVER_ERROR';
    const status = (err as { status?: number }).status || (message === 'NOT_AUTHENTICATED' ? 401 : 500);
    if (message === 'not authorized to act as another user' || message === 'MFA required to act as another user') {
      return json({ error: message }, 403);
    }
    if (message === 'STRIPE_NOT_CONFIGURED') {
      return json({ error: 'STRIPE_NOT_CONFIGURED' }, 503);
    }
    console.error('stripe-connect error', { message });
    return json({ error: message === 'NOT_AUTHENTICATED' ? 'NOT_AUTHENTICATED' : 'SERVER_ERROR' }, status);
  }
});
