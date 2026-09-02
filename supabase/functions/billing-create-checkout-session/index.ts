import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import {
  ensureBillingCustomer,
  findLocalOpenSubscription,
} from '../_shared/billingEntitlement.ts';
import { applySpeedVendorsCheckoutCustomerFields, resolveSpeedVendorsPrice } from '../_shared/billingCatalog.ts';
import {
  billingCorsHeaders,
  expireCheckoutSession,
  getBillingAppOrigin,
  getStripeBillingApiSecrets,
  isOpenBillingSubscriptionStatus,
  listOpenCheckoutSessionsForCustomer,
  listStripeSubscriptionsForCustomer,
  stripeBillingFormPost,
  stripeEnvironmentLabel,
} from '../_shared/billingStripe.ts';
import {
  parseInterval,
  parseTier,
  SPEEDVENDORS_PLANS,
  type BillingInterval,
  type SpeedVendorsTier,
} from '../_shared/speedvendorsPlans.ts';

const cors = billingCorsHeaders();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function blockingSubscriptionResponse(params: {
  status: string;
  plan: string | null;
  tier: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}): Response {
  const { status, plan, tier, currentPeriodEnd, cancelAtPeriodEnd } = params;
  if (cancelAtPeriodEnd && (status === 'active' || status === 'trialing')) {
    return json(
      {
        error: 'subscription_canceling',
        plan,
        tier,
        status,
        current_period_end: currentPeriodEnd,
      },
      409,
    );
  }
  if (status === 'incomplete') {
    return json(
      {
        error: 'subscription_incomplete',
        plan,
        tier,
        status,
        current_period_end: currentPeriodEnd,
      },
      409,
    );
  }
  return json(
    {
      error: 'already_subscribed',
      plan,
      tier,
      status,
      current_period_end: currentPeriodEnd,
    },
    409,
  );
}

function requestedPlan(body: Record<string, unknown>): {
  tier: SpeedVendorsTier;
  interval: BillingInterval;
} | null {
  if (typeof body.price_id === 'string' || typeof body.amount === 'number' || typeof body.amount === 'string') {
    return null;
  }
  const tier = parseTier(typeof body.tier === 'string' ? body.tier : null);
  const interval =
    parseInterval(typeof body.interval === 'string' ? body.interval : null) ||
    parseInterval(typeof body.plan === 'string' ? body.plan : null);
  if (tier && interval) return { tier, interval };
  // Legacy body `{ plan: 'monthly' | 'yearly' }` maps to START.
  if (!tier && interval) return { tier: 'start', interval };
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'unauthorized' }, 401);

    const emailConfirmed = Boolean(
      (user as { email_confirmed_at?: string | null }).email_confirmed_at ||
        (user as { confirmed_at?: string | null }).confirmed_at,
    );
    if (!emailConfirmed) {
      return json({ error: 'email_not_verified' }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.client_surface === 'native') {
      return json({ error: 'native_billing_blocked' }, 403);
    }
    const requested = requestedPlan(body);
    if (!requested) return json({ error: 'invalid_plan' }, 400);

    const secrets = getStripeBillingApiSecrets();
    const stripeEnv = stripeEnvironmentLabel(secrets.livemode);
    const admin = createClient(supabaseUrl, service);
    const customer = await ensureBillingCustomer({
      admin,
      userId: user.id,
      email: user.email,
    });

    const localOpen = await findLocalOpenSubscription(admin, user.id);
    if (localOpen) {
      return blockingSubscriptionResponse({
        status: localOpen.status,
        plan: localOpen.plan,
        tier: localOpen.tier,
        currentPeriodEnd: localOpen.current_period_end,
        cancelAtPeriodEnd: localOpen.cancel_at_period_end,
      });
    }

    const stripeSubs = await listStripeSubscriptionsForCustomer(
      secrets.secretKey,
      customer.stripe_customer_id,
    );
    const stripeOpen = stripeSubs.find((s) => isOpenBillingSubscriptionStatus(s.status));
    if (stripeOpen) {
      return blockingSubscriptionResponse({
        status: stripeOpen.status,
        plan: stripeOpen.billingInterval === 'year' ? 'yearly' : stripeOpen.billingInterval === 'month' ? 'monthly' : null,
        tier: null,
        currentPeriodEnd: stripeOpen.currentPeriodEnd,
        cancelAtPeriodEnd: stripeOpen.cancelAtPeriodEnd,
      });
    }

    const resolved = await resolveSpeedVendorsPrice(
      secrets.secretKey,
      requested.tier,
      requested.interval,
      { allowCreate: !secrets.livemode },
    );
    const openSessions = await listOpenCheckoutSessionsForCustomer(
      secrets.secretKey,
      customer.stripe_customer_id,
    );
    for (const session of openSessions) {
      if (session.tier === requested.tier && session.interval === requested.interval && session.url) {
        return json({ url: session.url, session_id: session.id, resumed: true });
      }
      try {
        await expireCheckoutSession(secrets.secretKey, session.id);
      } catch (expireErr) {
        const message = expireErr instanceof Error ? expireErr.message : 'unknown';
        console.error('expire open checkout session failed', { message });
      }
    }

    const origin = getBillingAppOrigin();
    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('customer', customer.stripe_customer_id);
    params.set('client_reference_id', user.id);
    params.set('success_url', `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${origin}/subscribe`);
    params.set('allow_promotion_codes', 'true');
    applySpeedVendorsCheckoutCustomerFields(params);
    params.set('line_items[0][price]', resolved.priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('metadata[speedvendors_user_id]', user.id);
    params.set('metadata[tier]', requested.tier);
    params.set('metadata[billing_interval]', requested.interval);
    params.set('metadata[plan]', requested.interval);
    params.set('metadata[lookup_key]', resolved.lookupKey);
    params.set('subscription_data[metadata][speedvendors_user_id]', user.id);
    params.set('subscription_data[metadata][tier]', requested.tier);
    params.set('subscription_data[metadata][billing_interval]', requested.interval);
    params.set('subscription_data[metadata][plan]', requested.interval);
    params.set('subscription_data[metadata][lookup_key]', resolved.lookupKey);
    params.set(
      'subscription_data[metadata][media_quota_bytes]',
      String(SPEEDVENDORS_PLANS[requested.tier].mediaQuotaBytes),
    );

    const session = await stripeBillingFormPost(
      secrets.secretKey,
      '/checkout/sessions',
      params,
    );

    const url = typeof session.url === 'string' ? session.url : null;
    const id = typeof session.id === 'string' ? session.id : null;
    if (!url || !id) {
      return json({ error: 'checkout_session_failed' }, 500);
    }

    console.log('billing checkout created', {
      user_id: user.id,
      tier: requested.tier,
      interval: requested.interval,
      lookup_key: resolved.lookupKey,
      stripe_environment: stripeEnv,
      session_id: id,
    });
    return json({ url, session_id: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('billing-create-checkout-session failed', { message });
    if (message.includes('NOT_CONFIGURED') || message === 'APP_ORIGIN_MISSING' || message === 'STRIPE_PRICE_LOOKUP_FAILED') {
      return json({ error: 'billing_not_configured' }, 503);
    }
    return json({ error: 'server_error' }, 500);
  }
});
