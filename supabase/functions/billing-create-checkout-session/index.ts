import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import {
  ensureBillingCustomer,
  findLocalOpenSubscription,
} from '../_shared/billingEntitlement.ts';
import {
  billingCorsHeaders,
  expireCheckoutSession,
  getStripeBillingApiSecrets,
  isOpenBillingSubscriptionStatus,
  listOpenCheckoutSessionsForCustomer,
  listStripeSubscriptionsForCustomer,
  priceIdForPlan,
  stripeBillingFormPost,
  type PlanInterval,
} from '../_shared/billingStripe.ts';

const cors = billingCorsHeaders();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
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

function blockingSubscriptionResponse(params: {
  status: string;
  plan: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}): Response {
  const { status, plan, currentPeriodEnd, cancelAtPeriodEnd } = params;
  if (cancelAtPeriodEnd && (status === 'active' || status === 'trialing')) {
    return json(
      {
        error: 'subscription_canceling',
        plan,
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
      status,
      current_period_end: currentPeriodEnd,
    },
    409,
  );
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

    const body = await req.json().catch(() => ({}));
    const plan = (body.plan === 'yearly' ? 'yearly' : body.plan === 'monthly' ? 'monthly' : null) as
      | PlanInterval
      | null;
    if (!plan) return json({ error: 'invalid_plan' }, 400);

    const secrets = getStripeBillingApiSecrets();
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
        currentPeriodEnd: stripeOpen.currentPeriodEnd,
        cancelAtPeriodEnd: stripeOpen.cancelAtPeriodEnd,
      });
    }

    const priceId = priceIdForPlan(secrets, plan);
    const openSessions = await listOpenCheckoutSessionsForCustomer(
      secrets.secretKey,
      customer.stripe_customer_id,
    );
    for (const session of openSessions) {
      if (session.plan === plan && session.url) {
        return json({ url: session.url, session_id: session.id, resumed: true });
      }
      try {
        await expireCheckoutSession(secrets.secretKey, session.id);
      } catch (expireErr) {
        const message = expireErr instanceof Error ? expireErr.message : 'unknown';
        console.error('expire open checkout session failed', { message });
      }
    }

    const origin = getAppOrigin();
    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('customer', customer.stripe_customer_id);
    params.set('client_reference_id', user.id);
    params.set('success_url', `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${origin}/subscribe`);
    params.set('allow_promotion_codes', 'true');
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('metadata[speedvendors_user_id]', user.id);
    params.set('metadata[plan]', plan);
    params.set('subscription_data[metadata][speedvendors_user_id]', user.id);
    params.set('subscription_data[metadata][plan]', plan);

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

    console.log('billing checkout created', { user_id: user.id, plan, session_id: id });
    return json({ url, session_id: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('billing-create-checkout-session failed', { message });
    if (message.includes('NOT_CONFIGURED') || message === 'APP_ORIGIN_MISSING') {
      return json({ error: 'billing_not_configured' }, 503);
    }
    return json({ error: 'server_error' }, 500);
  }
});
