/**
 * Sandbox-only helpers for SpeedVendors billing lifecycle tests.
 * Must never run against livemode secrets.
 */

import {
  ensureBillingCustomer,
  refreshSubscriptionFromStripe,
  findLocalOpenSubscription,
  syncSubscriptionFromStripe,
} from './billingEntitlement.ts';
import { resolveSpeedVendorsPrice, applySpeedVendorsCheckoutCustomerFields } from './billingCatalog.ts';
import {
  isOpenBillingSubscriptionStatus,
  listOpenCheckoutSessionsForCustomer,
  listStripeSubscriptionsForCustomer,
  retrieveSubscription,
  stripeBillingFormPost,
  expireCheckoutSession,
  getBillingAppOrigin,
} from './billingStripe.ts';
import {
  parseInterval,
  parseTier,
  SPEEDVENDORS_PLANS,
  type BillingInterval,
  type SpeedVendorsTier,
} from './speedvendorsPlans.ts';

// deno-lint-ignore no-explicit-any
type AdminClient = any;

async function attachTestCard(secretKey: string, customerId: string, cardToken = 'tok_visa'): Promise<string> {
  const pmForm = new URLSearchParams();
  pmForm.set('type', 'card');
  pmForm.set('card[token]', cardToken);
  const pm = await stripeBillingFormPost(secretKey, '/payment_methods', pmForm);
  const pmId = typeof pm.id === 'string' ? pm.id : '';
  if (!pmId.startsWith('pm_')) throw new Error('TEST_PAYMENT_METHOD_FAILED');
  await stripeBillingFormPost(
    secretKey,
    `/payment_methods/${encodeURIComponent(pmId)}/attach`,
    new URLSearchParams({ customer: customerId }),
  );
  const cust = new URLSearchParams();
  cust.set('invoice_settings[default_payment_method]', pmId);
  await stripeBillingFormPost(secretKey, `/customers/${encodeURIComponent(customerId)}`, cust);
  return pmId;
}

export async function sandboxSubscribe(params: {
  admin: AdminClient;
  secretKey: string;
  userId: string;
  email?: string | null;
  tier: SpeedVendorsTier;
  interval: BillingInterval;
}): Promise<{ subscriptionId: string; status: string; quotaBytes: number }> {
  const { admin, secretKey, userId, email, tier, interval } = params;
  const customer = await ensureBillingCustomer({ admin, userId, email });
  await attachTestCard(secretKey, customer.stripe_customer_id);
  const price = await resolveSpeedVendorsPrice(secretKey, tier, interval, { allowCreate: true });

  const form = new URLSearchParams();
  form.set('customer', customer.stripe_customer_id);
  form.set('items[0][price]', price.priceId);
  form.set('items[0][quantity]', '1');
  form.set('metadata[speedvendors_user_id]', userId);
  form.set('metadata[tier]', tier);
  form.set('metadata[billing_interval]', interval);
  form.set('metadata[lookup_key]', price.lookupKey);
  form.set('metadata[media_quota_bytes]', String(SPEEDVENDORS_PLANS[tier].mediaQuotaBytes));
  form.set('payment_behavior', 'error_if_incomplete');
  form.set('expand[]', 'items.data.price');

  const created = await stripeBillingFormPost(secretKey, '/subscriptions', form);
  const subscriptionId = typeof created.id === 'string' ? created.id : '';
  if (!subscriptionId.startsWith('sub_')) throw new Error('TEST_SUBSCRIPTION_FAILED');
  const normalized = await refreshSubscriptionFromStripe(admin, subscriptionId);
  return {
    subscriptionId,
    status: normalized.status,
    quotaBytes: SPEEDVENDORS_PLANS[tier].mediaQuotaBytes,
  };
}

export async function sandboxCreateCheckout(params: {
  admin: AdminClient;
  secretKey: string;
  userId: string;
  email?: string | null;
  tier: SpeedVendorsTier;
  interval: BillingInterval;
}): Promise<{
  url: string;
  sessionId: string;
  priceId: string;
  lookupKey: string;
  amountTotal: number | null;
  amountSubtotal: number | null;
  automaticTax: unknown;
  taxIdCollection: unknown;
  billingAddressCollection: unknown;
}> {
  const customer = await ensureBillingCustomer({
    admin: params.admin,
    userId: params.userId,
    email: params.email,
  });
  const resolved = await resolveSpeedVendorsPrice(params.secretKey, params.tier, params.interval, {
    allowCreate: true,
  });
  const origin = getBillingAppOrigin();
  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('customer', customer.stripe_customer_id);
  form.set('client_reference_id', params.userId);
  form.set('success_url', `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', `${origin}/subscribe`);
  applySpeedVendorsCheckoutCustomerFields(form);
  form.set('line_items[0][price]', resolved.priceId);
  form.set('line_items[0][quantity]', '1');
  form.set('metadata[speedvendors_user_id]', params.userId);
  form.set('metadata[tier]', params.tier);
  form.set('metadata[billing_interval]', params.interval);
  form.set('subscription_data[metadata][speedvendors_user_id]', params.userId);
  form.set('subscription_data[metadata][tier]', params.tier);
  form.set('subscription_data[metadata][billing_interval]', params.interval);
  const session = await stripeBillingFormPost(params.secretKey, '/checkout/sessions', form);
  const url = typeof session.url === 'string' ? session.url : '';
  const sessionId = typeof session.id === 'string' ? session.id : '';
  if (!url || !sessionId) throw new Error('TEST_CHECKOUT_FAILED');
  return {
    url,
    sessionId,
    priceId: resolved.priceId,
    lookupKey: resolved.lookupKey,
    amountTotal: typeof session.amount_total === 'number' ? session.amount_total : null,
    amountSubtotal: typeof session.amount_subtotal === 'number' ? session.amount_subtotal : null,
    automaticTax: session.automatic_tax ?? null,
    taxIdCollection: session.tax_id_collection ?? null,
    billingAddressCollection: session.billing_address_collection ?? null,
  };
}

export async function sandboxExpireOpenCheckouts(params: {
  admin: AdminClient;
  secretKey: string;
  userId: string;
}): Promise<number> {
  const customer = await ensureBillingCustomer({ admin: params.admin, userId: params.userId });
  const open = await listOpenCheckoutSessionsForCustomer(params.secretKey, customer.stripe_customer_id);
  let n = 0;
  for (const session of open) {
    await expireCheckoutSession(params.secretKey, session.id);
    n += 1;
  }
  return n;
}

export async function sandboxCancelAtPeriodEnd(params: {
  admin: AdminClient;
  secretKey: string;
  userId: string;
}): Promise<{ status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null }> {
  const local = await findLocalOpenSubscription(params.admin, params.userId);
  if (!local) throw new Error('NO_OPEN_SUBSCRIPTION');
  const current = await retrieveSubscription(params.secretKey, local.stripe_subscription_id);
  if (current.scheduleId) {
    try {
      await stripeBillingFormPost(
        params.secretKey,
        `/subscription_schedules/${encodeURIComponent(current.scheduleId)}/release`,
        new URLSearchParams(),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      console.error('release schedule before cancel failed', { message });
    }
  }
  await stripeBillingFormPost(
    params.secretKey,
    `/subscriptions/${encodeURIComponent(local.stripe_subscription_id)}`,
    new URLSearchParams({ cancel_at_period_end: 'true' }),
  );
  const normalized = await refreshSubscriptionFromStripe(params.admin, local.stripe_subscription_id);
  return {
    status: normalized.status,
    cancelAtPeriodEnd: normalized.cancelAtPeriodEnd,
    currentPeriodEnd: normalized.currentPeriodEnd,
  };
}

export async function sandboxFailPayment(params: {
  admin: AdminClient;
  secretKey: string;
  userId: string;
}): Promise<{ status: string; invoicePayError: string | null }> {
  const local = await findLocalOpenSubscription(params.admin, params.userId);
  if (!local) throw new Error('NO_OPEN_SUBSCRIPTION');
  const current = await retrieveSubscription(params.secretKey, local.stripe_subscription_id);
  await attachTestCard(params.secretKey, current.customerId, 'tok_chargeCustomerFail');

  let invoicePayError: string | null = null;
  try {
    const cycle = new URLSearchParams();
    cycle.set('billing_cycle_anchor', 'now');
    cycle.set('proration_behavior', 'none');
    await stripeBillingFormPost(
      params.secretKey,
      `/subscriptions/${encodeURIComponent(local.stripe_subscription_id)}`,
      cycle,
    );
  } catch (err) {
    invoicePayError = err instanceof Error ? err.message : 'invoice_pay_failed';
  }

  const normalized = await refreshSubscriptionFromStripe(params.admin, local.stripe_subscription_id);
  return { status: normalized.status, invoicePayError };
}

export function parseSandboxPlan(body: Record<string, unknown>): {
  tier: SpeedVendorsTier;
  interval: BillingInterval;
} | null {
  const tier = parseTier(typeof body.tier === 'string' ? body.tier : null);
  const interval = parseInterval(typeof body.interval === 'string' ? body.interval : null);
  if (!tier || !interval) return null;
  return { tier, interval };
}

export { listStripeSubscriptionsForCustomer, isOpenBillingSubscriptionStatus, syncSubscriptionFromStripe };
