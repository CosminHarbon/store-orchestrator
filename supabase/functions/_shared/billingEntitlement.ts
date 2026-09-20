/**
 * Local entitlement sync for SpeedVendors SaaS billing.
 * Never call Stripe on login — only read/update Supabase state here.
 */

import {
  type NormalizedSubscription,
  type PlanInterval,
  getStripeBillingApiSecrets,
  isBillingEnforcementEnvAllowed,
  isOpenBillingSubscriptionStatus,
  planFromPriceId,
  retrievePendingScheduleChange,
  retrieveSubscription,
  stripeBillingFormPost,
  stripeBillingGet,
} from './billingStripe.ts';
import { identifyPrice } from './billingCatalog.ts';
import {
  entitlementMetadataFromPlan,
  intervalFromStripe,
  parseInterval,
  parseTier,
  type BillingInterval,
  type SpeedVendorsTier,
} from './speedvendorsPlans.ts';

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export type BillingSettings = {
  enforcement_enabled: boolean;
  grace_period_days: number;
};

export async function loadBillingSettings(admin: AdminClient): Promise<BillingSettings> {
  const { data, error } = await admin
    .from('billing_settings')
    .select('enforcement_enabled, grace_period_days')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    console.error('billing_settings load failed', { message: error.message });
    return { enforcement_enabled: false, grace_period_days: 7 };
  }
  return {
    enforcement_enabled: data?.enforcement_enabled === true,
    grace_period_days: typeof data?.grace_period_days === 'number' ? data.grace_period_days : 7,
  };
}

/**
 * Effective enforcement = canonical DB flag AND environment allows it.
 * Env may only force OFF (emergency kill switch), never independently force ON.
 */
export async function isBillingEnforcementActive(admin: AdminClient): Promise<boolean> {
  if (!isBillingEnforcementEnvAllowed()) return false;
  const settings = await loadBillingSettings(admin);
  return settings.enforcement_enabled;
}

export function entitlementRequiredResponse(cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: 'entitlement_required' }), {
    status: 403,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export function isEntitlementRequiredError(err: unknown): boolean {
  return err instanceof Error && err.message === 'ENTITLEMENT_REQUIRED';
}

/** "May use the app": paid entitlement OR active free trial (see migration 20260920120000). */
export async function userHasActiveEntitlement(
  admin: AdminClient,
  userId: string,
): Promise<boolean> {
  await admin.rpc('expire_lapsed_stripe_grace');
  const { data, error } = await admin.rpc('user_has_active_entitlement', {
    p_user_id: userId,
  });
  if (error) {
    console.error('user_has_active_entitlement failed', { message: error.message });
    return false;
  }
  return data === true;
}

/**
 * "Is this user a subscriber?" — paid entitlements only (Stripe, access code, manual). An active
 * free trial does NOT count. Falls back to userHasActiveEntitlement if the RPC is not deployed yet.
 */
export async function userHasPaidEntitlement(
  admin: AdminClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('user_has_paid_entitlement', { p_user_id: userId });
  if (error) {
    console.error('user_has_paid_entitlement failed', { message: error.message });
    return userHasActiveEntitlement(admin, userId);
  }
  return data === true;
}

export async function isSuperadminUserId(
  admin: AdminClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'superadmin')
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/**
 * Canonical access decision, computed by Postgres (user_has_speedvendors_access):
 * superadmin OR paid entitlement OR active free trial OR (legacy user AND enforcement off).
 * Users with a trial row are enforced even while the global flag is off, so an expired
 * trial locks server-side without changing behaviour for pre-trial users.
 * Returns null when the RPC is unavailable (e.g. Edge deployed before the migration).
 */
export async function userHasSpeedVendorsAccess(
  admin: AdminClient,
  userId: string,
): Promise<boolean | null> {
  const { data, error } = await admin.rpc('user_has_speedvendors_access', {
    p_user_id: userId,
  });
  if (error) {
    console.error('user_has_speedvendors_access failed', { message: error.message });
    return null;
  }
  return data === true;
}

/**
 * Throws if the user lacks access.
 * Superadmins bypass. Impersonation must NOT be used for billing mutations —
 * pass the JWT subject only.
 *
 * BILLING_ENFORCEMENT_ENABLED=false remains the emergency kill switch and disables all checks.
 */
export async function requireSpeedVendorsEntitlement(
  admin: AdminClient,
  userId: string,
): Promise<void> {
  if (!isBillingEnforcementEnvAllowed()) return;

  const access = await userHasSpeedVendorsAccess(admin, userId);
  if (access === true) return;
  if (access === false) throw new Error('ENTITLEMENT_REQUIRED');

  // RPC unavailable: fall back to the pre-trial behaviour rather than failing open or closed.
  if (!(await isBillingEnforcementActive(admin))) return;
  if (await isSuperadminUserId(admin, userId)) return;
  if (await userHasActiveEntitlement(admin, userId)) return;
  throw new Error('ENTITLEMENT_REQUIRED');
}

export async function ensureBillingCustomer(params: {
  admin: AdminClient;
  userId: string;
  email?: string | null;
}): Promise<{ id: string; stripe_customer_id: string }> {
  const { admin, userId, email } = params;
  const secrets = getStripeBillingApiSecrets();

  const { data: existing, error: selErr } = await admin
    .from('billing_customers')
    .select('id, stripe_customer_id, livemode')
    .eq('user_id', userId)
    .maybeSingle();
  if (selErr) {
    console.error('billing_customers select failed', { message: selErr.message });
    throw new Error('BILLING_CUSTOMER_FAILED');
  }

  if (existing?.stripe_customer_id) {
    const reusable = await stripeCustomerMatchesMode(
      secrets.secretKey,
      existing.stripe_customer_id,
      secrets.livemode,
    );
    if (reusable) {
      if (existing.livemode !== secrets.livemode) {
        await admin
          .from('billing_customers')
          .update({ livemode: secrets.livemode, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }
      return { id: existing.id, stripe_customer_id: existing.stripe_customer_id };
    }
  }

  const form = new URLSearchParams();
  form.set('metadata[speedvendors_user_id]', userId);
  if (email) form.set('email', email);

  const customer = await stripeBillingFormPost(secrets.secretKey, '/customers', form);
  const stripeCustomerId = String(customer.id || '');
  if (!stripeCustomerId.startsWith('cus_')) {
    throw new Error('BILLING_CUSTOMER_FAILED');
  }

  const { data: inserted, error: insErr } = await admin
    .from('billing_customers')
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
        email: email || null,
        livemode: secrets.livemode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('id, stripe_customer_id')
    .single();

  if (insErr || !inserted) {
    console.error('billing_customers upsert failed', { message: insErr?.message });
    throw new Error('BILLING_CUSTOMER_FAILED');
  }
  return inserted;
}

async function stripeCustomerMatchesMode(
  secretKey: string,
  customerId: string,
  livemode: boolean,
): Promise<boolean> {
  try {
    const retrieved = await stripeBillingGet(secretKey, `/customers/${encodeURIComponent(customerId)}`);
    return retrieved.livemode === livemode && String(retrieved.id || '') === customerId;
  } catch {
    return false;
  }
}

function planFromNormalized(
  secrets: { monthlyPriceId: string | null; yearlyPriceId: string | null },
  sub: NormalizedSubscription,
): PlanInterval | null {
  const fromPrice = planFromPriceId(secrets, sub.priceId);
  if (fromPrice) return fromPrice;
  if (sub.billingInterval === 'year') return 'yearly';
  if (sub.billingInterval === 'month') return 'monthly';
  return null;
}

function identifyNormalizedPlan(sub: NormalizedSubscription): {
  tier: SpeedVendorsTier;
  interval: BillingInterval;
} {
  const identified = identifyPrice({
    priceId: sub.priceId,
    lookupKey: sub.lookupKey,
    metadata: sub.priceMetadata,
    billingInterval: sub.billingInterval,
  });
  if (identified) return identified;
  const interval = intervalFromStripe(sub.billingInterval) || 'monthly';
  return { tier: 'start', interval };
}

export type LocalOpenSubscription = {
  id: string;
  stripe_subscription_id: string;
  status: string;
  plan: string | null;
  tier: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export async function findLocalOpenSubscription(
  admin: AdminClient,
  userId: string,
): Promise<LocalOpenSubscription | null> {
  const secrets = getStripeBillingApiSecrets();
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select(
      'id, stripe_subscription_id, status, plan, tier, current_period_end, cancel_at_period_end',
    )
    .eq('user_id', userId)
    .eq('livemode', secrets.livemode)
    .in('status', ['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('findLocalOpenSubscription failed', { message: error.message });
    throw new Error('SUBSCRIPTION_LOOKUP_FAILED');
  }
  return data ?? null;
}

function entitlementFieldsFromNormalized(
  sub: NormalizedSubscription,
  graceUntil: string | null,
  pending?: {
    tier: SpeedVendorsTier | null;
    interval: BillingInterval | null;
    effectiveAt: string | null;
  },
): { status: 'active' | 'expired'; validUntil: string | null; metadata: Record<string, unknown> } {
  let status: 'active' | 'expired' = 'expired';
  let validUntil: string | null = null;

  if (sub.status === 'active' || sub.status === 'trialing') {
    status = 'active';
    if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
      validUntil = sub.currentPeriodEnd;
    } else {
      validUntil = null;
    }
  } else if (sub.status === 'past_due' && graceUntil && new Date(graceUntil).getTime() > Date.now()) {
    status = 'active';
    validUntil = graceUntil;
  }

  const identified = identifyNormalizedPlan(sub);

  return {
    status,
    validUntil,
    metadata: entitlementMetadataFromPlan({
      tier: identified.tier,
      interval: identified.interval,
      priceId: sub.priceId,
      productId: sub.productId,
      subscriptionId: sub.id,
      stripeStatus: sub.status,
      graceUntil,
      lookupKey: sub.lookupKey,
      pendingTier: pending?.tier || null,
      pendingInterval: pending?.interval || null,
      pendingEffectiveAt: pending?.effectiveAt || null,
    }),
  };
}

/**
 * Upsert local subscription row + recompute stripe entitlement in one DB transaction.
 * Access is never granted from checkout.session.completed alone —
 * only from verified subscription status (+ grace rules).
 *
 * Duplicate-open policy (non-destructive): do not insert a second open row and
 * do not cancel Stripe subscriptions from the webhook. Record conflict metadata
 * and throw DUPLICATE_OPEN_SUBSCRIPTION so Stripe can retry after the first
 * subscription is canceled.
 */
export async function syncSubscriptionFromStripe(params: {
  admin: AdminClient;
  userId: string;
  billingCustomerId: string;
  normalized: NormalizedSubscription;
}): Promise<void> {
  const { admin, userId, billingCustomerId, normalized: sub } = params;
  const secrets = getStripeBillingApiSecrets();
  const settings = await loadBillingSettings(admin);
  const plan = planFromNormalized(secrets, sub);
  const identified = identifyNormalizedPlan(sub);

  let pendingTier: SpeedVendorsTier | null = null;
  let pendingInterval: BillingInterval | null = null;
  let pendingEffectiveAt: string | null = null;
  try {
    const pending = await retrievePendingScheduleChange(secrets.secretKey, sub.scheduleId);
    if (pending) {
      const pendingIdentified = identifyPrice({
        priceId: pending.priceId,
        lookupKey: pending.lookupKey,
        metadata: pending.priceMetadata,
        billingInterval: pending.billingInterval,
      });
      pendingTier = pendingIdentified?.tier || parseTier(pending.priceMetadata.tier);
      pendingInterval = pendingIdentified?.interval || parseInterval(pending.priceMetadata.billing_interval);
      pendingEffectiveAt = pending.effectiveAt;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('pending schedule lookup failed', { message });
  }

  const { data: existing } = await admin
    .from('billing_subscriptions')
    .select('id, grace_until, status')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle();

  let graceUntil: string | null = existing?.grace_until ?? null;
  const now = Date.now();

  if (sub.status === 'past_due') {
    if (!graceUntil) {
      const until = new Date(now + settings.grace_period_days * 24 * 60 * 60 * 1000);
      graceUntil = until.toISOString();
    }
  } else if (sub.status === 'active' || sub.status === 'trialing') {
    graceUntil = null;
  }

  const ent = entitlementFieldsFromNormalized(sub, graceUntil, {
    tier: pendingTier,
    interval: pendingInterval,
    effectiveAt: pendingEffectiveAt,
  });

  const subscriptionMetadata: Record<string, unknown> = {};
  if (pendingTier && pendingInterval) {
    subscriptionMetadata.pending_tier = pendingTier;
    subscriptionMetadata.pending_interval = pendingInterval;
    subscriptionMetadata.pending_effective_at = pendingEffectiveAt;
  }

  const { data: syncResult, error: syncErr } = await admin.rpc(
    'sync_billing_subscription_from_stripe',
    {
      p_user_id: userId,
      p_billing_customer_id: billingCustomerId,
      p_stripe_subscription_id: sub.id,
      p_stripe_price_id: sub.priceId,
      p_stripe_product_id: sub.productId,
      p_plan: plan,
      p_billing_interval: sub.billingInterval,
      p_status: sub.status,
      p_current_period_start: sub.currentPeriodStart,
      p_current_period_end: sub.currentPeriodEnd,
      p_cancel_at_period_end: sub.cancelAtPeriodEnd,
      p_canceled_at: sub.canceledAt,
      p_grace_until: graceUntil,
      p_latest_invoice_id: sub.latestInvoiceId,
      p_livemode: sub.livemode,
      p_entitlement_status: ent.status,
      p_entitlement_valid_until: ent.validUntil,
      p_entitlement_metadata: ent.metadata,
      p_tier: identified.tier,
      p_subscription_metadata: subscriptionMetadata,
    },
  );

  if (syncErr) {
    console.error('billing subscription sync rpc failed', { message: syncErr.message });
    throw new Error('SUBSCRIPTION_SYNC_FAILED');
  }

  const code = syncResult && typeof syncResult === 'object' ? (syncResult as { code?: string }).code : null;
  if (code === 'DUPLICATE_OPEN_SUBSCRIPTION') {
    console.error('duplicate open SpeedVendors subscription', {
      user_id: userId,
      incoming_prefix: sub.id.slice(0, 8),
      incoming_open: isOpenBillingSubscriptionStatus(sub.status),
    });
    throw new Error('DUPLICATE_OPEN_SUBSCRIPTION');
  }
  if (code !== 'SYNCED') {
    throw new Error('SUBSCRIPTION_SYNC_FAILED');
  }
}

export async function resolveUserIdForStripeCustomer(
  admin: AdminClient,
  stripeCustomerId: string,
): Promise<{ userId: string; billingCustomerId: string } | null> {
  const { data, error } = await admin
    .from('billing_customers')
    .select('id, user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();
  if (error || !data) return null;
  return { userId: data.user_id, billingCustomerId: data.id };
}

/**
 * Retrieve the live Stripe subscription and persist via sync_billing_subscription_from_stripe.
 * Does not mutate Stripe.
 */
export async function refreshSubscriptionFromStripe(
  admin: AdminClient,
  subscriptionId: string,
): Promise<NormalizedSubscription> {
  const secrets = getStripeBillingApiSecrets();
  const normalized = await retrieveSubscription(secrets.secretKey, subscriptionId);
  const mapping = await resolveUserIdForStripeCustomer(admin, normalized.customerId);
  if (!mapping) {
    throw new Error('UNKNOWN_CUSTOMER');
  }
  await syncSubscriptionFromStripe({
    admin,
    userId: mapping.userId,
    billingCustomerId: mapping.billingCustomerId,
    normalized,
  });
  return normalized;
}

export async function hashAccessCode(plaintext: string): Promise<string> {
  const pepper = Deno.env.get('ACCESS_CODE_PEPPER')?.trim() || '';
  if (pepper.length < 16) {
    throw new Error('ACCESS_CODE_PEPPER_NOT_CONFIGURED');
  }
  const material = `${pepper}:${plaintext.trim().toUpperCase()}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateAccessCodePlaintext(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (const b of bytes) {
    out += alphabet[b % alphabet.length];
  }
  // SV-XXXX-XXXX-XXXX-XXXX
  return `SV-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}
