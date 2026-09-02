/**
 * SpeedVendors SaaS Billing (merchant → platform).
 * Completely separate from Connect helpers in ./stripe.ts.
 *
 * API version: 2026-08-26.dahlia (Dahlia; includes Basil billing-period + invoice parent changes).
 * - current_period_start / current_period_end live on Subscription Items (not Subscription)
 * - Invoice.subscription removed → invoice.parent.subscription_details.subscription
 * - Checkout subscription mode creates the Subscription after payment completes
 */

export const STRIPE_BILLING_API_BASE = 'https://api.stripe.com/v1';

/** Pin Billing API retrieves/creates to Dahlia (match webhook destination API version). */
export const STRIPE_BILLING_API_VERSION = '2026-08-26.dahlia';

export type StripeBillingSecrets = {
  secretKey: string;
  webhookSecret: string;
  /** Optional legacy two-price IDs. New catalogue resolves by lookup key. */
  monthlyPriceId: string | null;
  yearlyPriceId: string | null;
  livemode: boolean;
};

export function stripeEnvironmentLabel(livemode: boolean): 'live' | 'sandbox' {
  return livemode ? 'live' : 'sandbox';
}

function optionalPriceId(raw: string | undefined): string | null {
  const value = (raw || '').trim();
  return value.startsWith('price_') ? value : null;
}

function classifyStripeSecretPrefix(value: string): {
  kind: 'sk_live' | 'sk_test' | 'rk_live' | 'rk_test' | 'pk_live' | 'pk_test' | 'whsec' | 'empty' | 'unrecognized';
  livemode: boolean | null;
} {
  const raw = value.trim();
  if (!raw) return { kind: 'empty', livemode: null };
  if (raw.startsWith('sk_live_')) return { kind: 'sk_live', livemode: true };
  if (raw.startsWith('sk_test_')) return { kind: 'sk_test', livemode: false };
  if (raw.startsWith('rk_live_')) return { kind: 'rk_live', livemode: true };
  if (raw.startsWith('rk_test_')) return { kind: 'rk_test', livemode: false };
  if (raw.startsWith('pk_live_')) return { kind: 'pk_live', livemode: true };
  if (raw.startsWith('pk_test_')) return { kind: 'pk_test', livemode: false };
  if (raw.startsWith('whsec_')) return { kind: 'whsec', livemode: null };
  return { kind: 'unrecognized', livemode: null };
}

export function inspectBillingSecretKinds(): {
  billing_secret_kind: string;
  webhook_secret_kind: string;
  portal_config_id_kind: string;
} {
  const billing = classifyStripeSecretPrefix(Deno.env.get('STRIPE_BILLING_SECRET_KEY') || '');
  const webhook = classifyStripeSecretPrefix(Deno.env.get('STRIPE_BILLING_WEBHOOK_SECRET') || '');
  const portal = (Deno.env.get('STRIPE_PORTAL_CONFIGURATION_ID') || '').trim();
  return {
    billing_secret_kind: billing.kind,
    webhook_secret_kind: webhook.kind,
    portal_config_id_kind: portal.startsWith('bpc_') ? 'bpc' : portal ? 'unrecognized' : 'empty',
  };
}

function isBillingSecretKey(value: string): boolean {
  const kind = classifyStripeSecretPrefix(value).kind;
  return kind === 'sk_live' || kind === 'sk_test' || kind === 'rk_live' || kind === 'rk_test';
}

export function getStripeBillingSecrets(): StripeBillingSecrets {
  const secretKey = Deno.env.get('STRIPE_BILLING_SECRET_KEY')?.trim() || '';
  const webhookSecret = Deno.env.get('STRIPE_BILLING_WEBHOOK_SECRET')?.trim() || '';
  const monthlyPriceId = optionalPriceId(Deno.env.get('STRIPE_MONTHLY_PRICE_ID'));
  const yearlyPriceId = optionalPriceId(Deno.env.get('STRIPE_YEARLY_PRICE_ID'));

  if (!isBillingSecretKey(secretKey)) {
    throw new Error('STRIPE_BILLING_NOT_CONFIGURED');
  }
  if (!webhookSecret.startsWith('whsec_')) {
    throw new Error('STRIPE_BILLING_WEBHOOK_NOT_CONFIGURED');
  }

  return {
    secretKey,
    webhookSecret,
    monthlyPriceId,
    yearlyPriceId,
    livemode: classifyStripeSecretPrefix(secretKey).livemode === true,
  };
}

/** Secrets needed only for Checkout / Portal (webhook secret optional). */
export function getStripeBillingApiSecrets(): Omit<StripeBillingSecrets, 'webhookSecret'> & {
  webhookSecret?: string;
} {
  const secretKey = Deno.env.get('STRIPE_BILLING_SECRET_KEY')?.trim() || '';
  const monthlyPriceId = optionalPriceId(Deno.env.get('STRIPE_MONTHLY_PRICE_ID'));
  const yearlyPriceId = optionalPriceId(Deno.env.get('STRIPE_YEARLY_PRICE_ID'));
  const webhookSecret = Deno.env.get('STRIPE_BILLING_WEBHOOK_SECRET')?.trim() || '';

  if (!isBillingSecretKey(secretKey)) {
    throw new Error('STRIPE_BILLING_NOT_CONFIGURED');
  }

  return {
    secretKey,
    monthlyPriceId,
    yearlyPriceId,
    livemode: classifyStripeSecretPrefix(secretKey).livemode === true,
    webhookSecret: webhookSecret.startsWith('whsec_') ? webhookSecret : undefined,
  };
}

export function getBillingAppOrigin(): string {
  const raw = (Deno.env.get('APP_ORIGIN') || '').trim();
  if (!raw) throw new Error('APP_ORIGIN_MISSING');
  const url = new URL(raw);
  const isLocalHttp =
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('APP_ORIGIN_INVALID');
  }
  if (!isLocalHttp && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    throw new Error('APP_ORIGIN_INVALID');
  }
  return url.origin;
}

export function billingCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, stripe-signature',
  };
}

/**
 * Emergency safety override only.
 * - unset / "true" / anything else → environment allows DB enforcement to take effect
 * - "false" / "0" / "off" / "no" → force enforcement OFF even if the DB flag is on
 * The database flag is the canonical runtime switch; this cannot independently force ON.
 */
export function isBillingEnforcementEnvAllowed(): boolean {
  const raw = (Deno.env.get('BILLING_ENFORCEMENT_ENABLED') || '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
  return true;
}

/** @deprecated Use isBillingEnforcementEnvAllowed — kept as an alias for existing imports. */
export function isBillingEnforcementEnvEnabled(): boolean {
  return isBillingEnforcementEnvAllowed();
}

export type PlanInterval = 'monthly' | 'yearly';

/** @deprecated Prefer lookup keys via billingCatalog.resolveSpeedVendorsPrice */
export function priceIdForPlan(
  secrets: { monthlyPriceId: string | null; yearlyPriceId: string | null },
  plan: PlanInterval,
): string | null {
  return plan === 'yearly' ? secrets.yearlyPriceId : secrets.monthlyPriceId;
}

export function planFromPriceId(
  secrets: { monthlyPriceId: string | null; yearlyPriceId: string | null },
  priceId: string | null | undefined,
): PlanInterval | null {
  if (!priceId) return null;
  if (secrets.monthlyPriceId && priceId === secrets.monthlyPriceId) return 'monthly';
  if (secrets.yearlyPriceId && priceId === secrets.yearlyPriceId) return 'yearly';
  return null;
}

/** Statuses that occupy the one-open-subscription slot (matches unique index). */
export const OPEN_BILLING_SUBSCRIPTION_STATUSES = [
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'paused',
] as const;

export type OpenBillingSubscriptionStatus =
  (typeof OPEN_BILLING_SUBSCRIPTION_STATUSES)[number];

export function isOpenBillingSubscriptionStatus(
  status: string | null | undefined,
): status is OpenBillingSubscriptionStatus {
  return OPEN_BILLING_SUBSCRIPTION_STATUSES.includes(
    status as OpenBillingSubscriptionStatus,
  );
}

/** Allowlisted webhook error codes only — never persist payloads or secrets. */
export function sanitizeBillingWebhookError(message: string | null | undefined): string {
  const trimmed = (message || '').trim();
  if (/^[A-Z][A-Z0-9_]{1,79}$/.test(trimmed)) return trimmed;
  return 'HANDLER_ERROR';
}

function billingHeaders(secretKey: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('Authorization', `Bearer ${secretKey}`);
  headers.set('Stripe-Version', STRIPE_BILLING_API_VERSION);
  return headers;
}

export async function stripeBillingFormPost(
  secretKey: string,
  path: string,
  params: URLSearchParams,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${STRIPE_BILLING_API_BASE}${path}`, {
    method: 'POST',
    headers: billingHeaders(secretKey, {
      'Content-Type': 'application/x-www-form-urlencoded',
    }),
    body: params,
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const errObj = payload.error as { type?: string; code?: string; message?: string } | undefined;
    console.error('stripe billing API error', {
      path,
      status: response.status,
      type: errObj?.type,
      code: errObj?.code,
      param: (payload.error as { param?: string } | undefined)?.param,
    });
    throw new Error(errObj?.code || errObj?.type || 'STRIPE_BILLING_API_ERROR');
  }
  return payload;
}

export async function stripeBillingGet(
  secretKey: string,
  path: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${STRIPE_BILLING_API_BASE}${path}`, {
    method: 'GET',
    headers: billingHeaders(secretKey),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const errObj = payload.error as { type?: string; code?: string } | undefined;
    console.error('stripe billing GET error', {
      path,
      status: response.status,
      type: errObj?.type,
      code: errObj?.code,
    });
    throw new Error(errObj?.code || errObj?.type || 'STRIPE_BILLING_API_ERROR');
  }
  return payload;
}

/**
 * Resolve subscription ID from an Invoice webhook/API object.
 * Dahlia/Basil: use parent.subscription_details.subscription when parent.type = subscription_details.
 * Legacy: top-level subscription (string or expanded).
 */
export function subscriptionIdFromInvoice(obj: Record<string, unknown>): string | null {
  const legacy = obj.subscription;
  if (typeof legacy === 'string' && legacy.startsWith('sub_')) return legacy;
  if (legacy && typeof legacy === 'object' && typeof (legacy as { id?: string }).id === 'string') {
    const id = (legacy as { id: string }).id;
    if (id.startsWith('sub_')) return id;
  }

  const parent = obj.parent as {
    type?: string;
    subscription_details?: { subscription?: string | { id?: string } | null };
  } | null;

  if (parent?.type === 'subscription_details' && parent.subscription_details) {
    const sub = parent.subscription_details.subscription;
    if (typeof sub === 'string' && sub.startsWith('sub_')) return sub;
    if (sub && typeof sub === 'object' && typeof sub.id === 'string' && sub.id.startsWith('sub_')) {
      return sub.id;
    }
  }

  return null;
}

function priceObjectFromItem(item: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!item) return null;
  if (item.price && typeof item.price === 'object') {
    return item.price as Record<string, unknown>;
  }
  return null;
}

function priceIdFromItem(item: Record<string, unknown> | null): string | null {
  if (!item) return null;
  if (typeof item.price === 'string' && item.price.startsWith('price_')) return item.price;
  const price = priceObjectFromItem(item);
  if (typeof price?.id === 'string') return price.id;
  return null;
}

function billingIntervalFromItem(item: Record<string, unknown> | null): 'month' | 'year' | null {
  const price = priceObjectFromItem(item);
  const recurring = price?.recurring as { interval?: string } | undefined;
  if (recurring?.interval === 'year' || recurring?.interval === 'month') {
    return recurring.interval;
  }
  const plan = item?.plan as { interval?: string } | undefined;
  if (plan?.interval === 'year' || plan?.interval === 'month') return plan.interval;
  return null;
}

/** Normalize Dahlia/Basil + legacy subscription shapes into local billing fields. */
export type NormalizedSubscription = {
  id: string;
  customerId: string;
  status: string;
  itemId: string | null;
  priceId: string | null;
  productId: string | null;
  lookupKey: string | null;
  priceMetadata: Record<string, string>;
  billingInterval: 'month' | 'year' | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  latestInvoiceId: string | null;
  scheduleId: string | null;
  livemode: boolean;
};

function unixToIso(ts: unknown): string | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  return new Date(ts * 1000).toISOString();
}

function firstSubscriptionItem(sub: Record<string, unknown>): Record<string, unknown> | null {
  const items = sub.items as { data?: unknown[] } | undefined;
  const first = items?.data?.[0];
  if (first && typeof first === 'object') return first as Record<string, unknown>;
  return null;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export function normalizeStripeSubscription(sub: Record<string, unknown>): NormalizedSubscription {
  const item = firstSubscriptionItem(sub);
  const price = priceObjectFromItem(item);
  const priceId = priceIdFromItem(item);

  // Dahlia/Basil: period on subscription item. Legacy fallback: top-level subscription fields.
  const periodStart =
    unixToIso(item?.current_period_start) ?? unixToIso(sub.current_period_start);
  const periodEnd =
    unixToIso(item?.current_period_end) ?? unixToIso(sub.current_period_end);

  const billingInterval = billingIntervalFromItem(item);

  const customer =
    typeof sub.customer === 'string'
      ? sub.customer
      : (sub.customer as { id?: string } | null)?.id || '';

  const latestInvoice =
    typeof sub.latest_invoice === 'string'
      ? sub.latest_invoice
      : (sub.latest_invoice as { id?: string } | null)?.id || null;

  const productRaw = price?.product;
  const productId =
    typeof productRaw === 'string'
      ? productRaw
      : (productRaw as { id?: string } | null)?.id || null;

  const scheduleRaw = sub.schedule;
  const scheduleId =
    typeof scheduleRaw === 'string' && scheduleRaw.startsWith('sub_sched_')
      ? scheduleRaw
      : typeof scheduleRaw === 'object' && scheduleRaw && typeof (scheduleRaw as { id?: string }).id === 'string'
        ? (scheduleRaw as { id: string }).id
        : null;

  const itemId =
    typeof item?.id === 'string' && item.id.startsWith('si_') ? item.id : null;

  return {
    id: String(sub.id || ''),
    customerId: customer,
    status: String(sub.status || ''),
    itemId,
    priceId,
    productId,
    lookupKey: typeof price?.lookup_key === 'string' ? price.lookup_key : null,
    priceMetadata: stringRecord(price?.metadata),
    billingInterval,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: isScheduledCancelAtPeriodEnd(sub),
    canceledAt: unixToIso(sub.canceled_at),
    latestInvoiceId: latestInvoice,
    scheduleId,
    livemode: sub.livemode === true,
  };
}

/**
 * Customer Portal / Dahlia flexible billing may set `cancel_at` (unix timestamp)
 * without `cancel_at_period_end=true`. Treat either as scheduled end-of-access.
 */
export function isScheduledCancelAtPeriodEnd(sub: Record<string, unknown>): boolean {
  if (sub.cancel_at_period_end === true) return true;
  const status = String(sub.status || '');
  if (status !== 'active' && status !== 'trialing') return false;
  const cancelAt = sub.cancel_at;
  return typeof cancelAt === 'number' && Number.isFinite(cancelAt) && cancelAt > 0;
}

export type PendingPlanChange = {
  priceId: string | null;
  lookupKey: string | null;
  priceMetadata: Record<string, string>;
  billingInterval: 'month' | 'year' | null;
  effectiveAt: string | null;
};

export async function retrievePendingScheduleChange(
  secretKey: string,
  scheduleId: string | null,
): Promise<PendingPlanChange | null> {
  if (!scheduleId || !scheduleId.startsWith('sub_sched_')) return null;
  const raw = await stripeBillingGet(
    secretKey,
    `/subscription_schedules/${encodeURIComponent(scheduleId)}?expand[]=phases.items.price`,
  );
  const phases = Array.isArray(raw.phases) ? raw.phases : [];
  if (phases.length < 2) return null;
  const next = phases[1] as Record<string, unknown>;
  const items = next.items as unknown[] | undefined;
  const first = items && typeof items[0] === 'object' ? items[0] as Record<string, unknown> : null;
  const price = first?.price && typeof first.price === 'object'
    ? first.price as Record<string, unknown>
    : null;
  const priceId =
    typeof first?.price === 'string'
      ? first.price
      : typeof price?.id === 'string'
        ? price.id
        : null;
  const recurring = price?.recurring as { interval?: string } | undefined;
  const billingInterval =
    recurring?.interval === 'year' || recurring?.interval === 'month' ? recurring.interval : null;
  return {
    priceId,
    lookupKey: typeof price?.lookup_key === 'string' ? price.lookup_key : null,
    priceMetadata: stringRecord(price?.metadata),
    billingInterval,
    effectiveAt: unixToIso(next.start_date),
  };
}

export async function retrieveSubscription(
  secretKey: string,
  subscriptionId: string,
): Promise<NormalizedSubscription> {
  const raw = await stripeBillingGet(
    secretKey,
    `/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=items.data.price&expand[]=schedule`,
  );
  return normalizeStripeSubscription(raw);
}

export async function listStripeSubscriptionsForCustomer(
  secretKey: string,
  customerId: string,
): Promise<NormalizedSubscription[]> {
  const raw = await stripeBillingGet(
    secretKey,
    `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=20&expand[]=data.items.data.price`,
  );
  const data = raw.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => normalizeStripeSubscription(item));
}

export async function listOpenCheckoutSessionsForCustomer(
  secretKey: string,
  customerId: string,
): Promise<Array<{
  id: string;
  status: string;
  url: string | null;
  plan: 'monthly' | 'yearly' | null;
  tier: string | null;
  interval: 'monthly' | 'yearly' | null;
}>> {
  const raw = await stripeBillingGet(
    secretKey,
    `/checkout/sessions?customer=${encodeURIComponent(customerId)}&status=open&limit=10`,
  );
  const data = raw.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const meta = (item.metadata || {}) as {
        plan?: string;
        tier?: string;
        billing_interval?: string;
      };
      const interval =
        meta.billing_interval === 'yearly' || meta.billing_interval === 'monthly'
          ? meta.billing_interval
          : meta.plan === 'yearly' || meta.plan === 'monthly'
            ? meta.plan
            : null;
      return {
        id: String(item.id || ''),
        status: String(item.status || ''),
        url: typeof item.url === 'string' ? item.url : null,
        plan: interval,
        tier: typeof meta.tier === 'string' ? meta.tier : null,
        interval,
      };
    })
    .filter((s) => s.id.startsWith('cs_'));
}

export async function expireCheckoutSession(
  secretKey: string,
  sessionId: string,
): Promise<void> {
  await stripeBillingFormPost(
    secretKey,
    `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
    new URLSearchParams(),
  );
}

// --- Webhook signature (Stripe docs: HMAC SHA256 of `${t}.${payload}`) ---

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify Stripe-Signature header. Returns parsed event JSON or throws.
 * Tolerance: 5 minutes (Stripe recommendation).
 */
export async function constructStripeBillingEvent(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  toleranceSeconds = 300,
): Promise<{
  id: string;
  type: string;
  livemode: boolean;
  data: { object: Record<string, unknown> };
}> {
  if (!signatureHeader) throw new Error('MISSING_SIGNATURE');

  const parts = signatureHeader.split(',').map((p) => p.trim());
  let timestamp = '';
  const v1Sigs: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 't') timestamp = v || '';
    if (k === 'v1' && v) v1Sigs.push(v);
  }
  if (!timestamp || v1Sigs.length === 0) throw new Error('INVALID_SIGNATURE');

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) throw new Error('INVALID_SIGNATURE');
  const age = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (age > toleranceSeconds) throw new Error('SIGNATURE_TIMESTAMP');

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = await hmacSha256Hex(webhookSecret, signedPayload);
  const ok = v1Sigs.some((s) => timingSafeEqual(s, expected));
  if (!ok) throw new Error('INVALID_SIGNATURE');

  const event = JSON.parse(rawBody) as {
    id?: string;
    type?: string;
    livemode?: boolean;
    data?: { object?: Record<string, unknown> };
  };
  if (!event.id || !event.type || !event.data?.object) {
    throw new Error('INVALID_EVENT');
  }
  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode === true,
    data: { object: event.data.object },
  };
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
