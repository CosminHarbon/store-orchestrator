/**
 * Local entitlement sync for SpeedVendors SaaS billing.
 * Never call Stripe on login — only read/update Supabase state here.
 */

import {
  type NormalizedSubscription,
  type PlanInterval,
  getStripeBillingApiSecrets,
  isBillingEnforcementEnvEnabled,
  isOpenBillingSubscriptionStatus,
  planFromPriceId,
  stripeBillingFormPost,
} from './billingStripe.ts';

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
 * Server enforcement requires BOTH the DB flag and the Edge env flag.
 * Both default false during development.
 */
export async function isBillingEnforcementActive(admin: AdminClient): Promise<boolean> {
  if (!isBillingEnforcementEnvEnabled()) return false;
  const settings = await loadBillingSettings(admin);
  return settings.enforcement_enabled;
}

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
 * Throws if enforcement is on and the user lacks access.
 * Superadmins bypass. Impersonation must NOT be used for billing mutations —
 * pass the JWT subject only.
 */
export async function requireSpeedVendorsEntitlement(
  admin: AdminClient,
  userId: string,
): Promise<void> {
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

  const { data: existing, error: selErr } = await admin
    .from('billing_customers')
    .select('id, stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (selErr) {
    console.error('billing_customers select failed', { message: selErr.message });
    throw new Error('BILLING_CUSTOMER_FAILED');
  }
  if (existing?.stripe_customer_id) {
    return existing;
  }

  const secrets = getStripeBillingApiSecrets();
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

function planFromNormalized(
  secrets: { monthlyPriceId: string; yearlyPriceId: string },
  sub: NormalizedSubscription,
): PlanInterval | null {
  const fromPrice = planFromPriceId(secrets, sub.priceId);
  if (fromPrice) return fromPrice;
  if (sub.billingInterval === 'year') return 'yearly';
  if (sub.billingInterval === 'month') return 'monthly';
  return null;
}

export type LocalOpenSubscription = {
  id: string;
  stripe_subscription_id: string;
  status: string;
  plan: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export async function findLocalOpenSubscription(
  admin: AdminClient,
  userId: string,
): Promise<LocalOpenSubscription | null> {
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select(
      'id, stripe_subscription_id, status, plan, current_period_end, cancel_at_period_end',
    )
    .eq('user_id', userId)
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

  return {
    status,
    validUntil,
    metadata: {
      stripe_status: sub.status,
      grace_until: graceUntil,
      price_id: sub.priceId,
    },
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

  const ent = entitlementFieldsFromNormalized(sub, graceUntil);

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
