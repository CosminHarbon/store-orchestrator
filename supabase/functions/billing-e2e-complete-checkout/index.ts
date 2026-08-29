/**
 * E2E validation helper — TEST MODE ONLY.
 * Confirms an open Stripe Checkout session with a test payment method so real
 * webhooks fire. Guarded: sk_test_ keys + @test.speedvendors.com emails only.
 * Remove or disable after billing E2E sign-off.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { ensureBillingCustomer } from '../_shared/billingEntitlement.ts';
import {
  billingCorsHeaders,
  getStripeBillingApiSecrets,
  priceIdForPlan,
  stripeBillingFormPost,
  stripeBillingGet,
  STRIPE_BILLING_API_BASE,
  STRIPE_BILLING_API_VERSION,
  type PlanInterval,
} from '../_shared/billingStripe.ts';

const cors = billingCorsHeaders();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function isE2eTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.endsWith('@test.speedvendors.com');
}

function billingHeaders(secretKey: string): Headers {
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${secretKey}`);
  headers.set('Stripe-Version', STRIPE_BILLING_API_VERSION);
  return headers;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const secrets = getStripeBillingApiSecrets();
    if (secrets.livemode) {
      return json({ error: 'e2e_disabled_in_livemode' }, 403);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, service);
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'unauthorized' }, 401);
    if (!isE2eTestEmail(user.email)) {
      return json({ error: 'e2e_email_not_allowed' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    if (body.inspect_webhooks === true) {
      const endpoints = await stripeBillingGet(secrets.secretKey, '/webhook_endpoints?limit=20');
      const data = Array.isArray(endpoints.data) ? endpoints.data : [];
      return json({
        endpoints: data.map((raw) => {
          const item = raw as Record<string, unknown>;
          return {
            id: item.id,
            status: item.status,
            api_version: item.api_version,
            url_host: typeof item.url === 'string' ? new URL(item.url).host : null,
            enabled_events: item.enabled_events,
            livemode: item.livemode,
          };
        }),
      });
    }

    if (body.add_invoice_paid_event === true) {
      const required = [
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.paid',
        'invoice.payment_failed',
        'invoice.payment_action_required',
      ];
      const endpoints = await stripeBillingGet(secrets.secretKey, '/webhook_endpoints?limit=20');
      const data = Array.isArray(endpoints.data) ? endpoints.data : [];
      const updated: unknown[] = [];
      for (const raw of data) {
        const item = raw as Record<string, unknown>;
        const id = String(item.id || '');
        if (!id.startsWith('we_')) continue;
        const params = new URLSearchParams();
        required.forEach((evt, i) => params.set(`enabled_events[${i}]`, evt));
        const result = await stripeBillingFormPost(
          secrets.secretKey,
          `/webhook_endpoints/${encodeURIComponent(id)}`,
          params,
        );
        updated.push({
          id: result.id,
          enabled_events: result.enabled_events,
        });
      }
      return json({ updated });
    }
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    const planRaw = body.plan === 'yearly' || body.plan === 'monthly' ? body.plan : null;
    const plan = planRaw as PlanInterval | null;
    const replaceExisting = body.replace_existing === true;

    if (!sessionId.startsWith('cs_test_') && !plan) {
      return json({ error: 'invalid_session_or_plan' }, 400);
    }

    let priceId: string | null = null;
    let sessionStatus: string | null = null;

    if (sessionId.startsWith('cs_test_')) {
      const session = await stripeBillingGet(
        secrets.secretKey,
        `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items.data.price&expand[]=subscription`,
      );

      const clientRef =
        typeof session.client_reference_id === 'string' ? session.client_reference_id : '';
      if (clientRef && clientRef !== user.id) {
        return json({ error: 'session_user_mismatch' }, 403);
      }

      sessionStatus = typeof session.status === 'string' ? session.status : null;
      if (sessionStatus === 'complete') {
        const sub =
          typeof session.subscription === 'string'
            ? session.subscription
            : (session.subscription as { id?: string } | null)?.id ?? null;
        return json({ status: 'already_complete', subscription_id: sub, session_id: sessionId });
      }

      const lineItems = session.line_items as { data?: Array<{ price?: { id?: string } | string }> } | null;
      const firstPrice = lineItems?.data?.[0]?.price;
      priceId =
        typeof firstPrice === 'string'
          ? firstPrice
          : typeof firstPrice?.id === 'string'
            ? firstPrice.id
            : null;

      const metaPlan = (session.metadata as { plan?: string } | null)?.plan;
      if (!priceId && (metaPlan === 'monthly' || metaPlan === 'yearly')) {
        priceId = priceIdForPlan(secrets, metaPlan);
      }
    }

    if (!priceId && plan) {
      priceId = priceIdForPlan(secrets, plan);
    }

    if (!priceId?.startsWith('price_')) {
      return json({ error: 'missing_price_id' }, 400);
    }

    const customer = await ensureBillingCustomer({
      admin,
      userId: user.id,
      email: user.email,
    });

    if (replaceExisting) {
      const list = await stripeBillingGet(
        secrets.secretKey,
        `/subscriptions?customer=${encodeURIComponent(customer.stripe_customer_id)}&status=active&limit=20`,
      );
      const subs = (list.data as Array<{ id?: string }> | undefined) ?? [];
      for (const s of subs) {
        if (typeof s.id === 'string' && s.id.startsWith('sub_')) {
          const delResp = await fetch(
            `${STRIPE_BILLING_API_BASE}/subscriptions/${encodeURIComponent(s.id)}`,
            {
              method: 'DELETE',
              headers: billingHeaders(secrets.secretKey),
            },
          );
          if (!delResp.ok) {
            const errPayload = await delResp.json().catch(() => ({}));
            console.error('e2e cancel subscription failed', {
              subscription_id: s.id,
              errPayload,
            });
          }
        }
      }
    }

    // Attach test PM + create active subscription (fires real Stripe webhooks).
    const pmParams = new URLSearchParams();
    pmParams.set('type', 'card');
    pmParams.set('card[token]', 'tok_visa');
    const pm = await stripeBillingFormPost(secrets.secretKey, '/payment_methods', pmParams);
    const pmId = String(pm.id || '');
    if (!pmId.startsWith('pm_')) {
      return json({ error: 'payment_method_failed' }, 500);
    }

    const attachParams = new URLSearchParams();
    attachParams.set('customer', customer.stripe_customer_id);
    await stripeBillingFormPost(
      secrets.secretKey,
      `/payment_methods/${encodeURIComponent(pmId)}/attach`,
      attachParams,
    );

    const customerParams = new URLSearchParams();
    customerParams.set('invoice_settings[default_payment_method]', pmId);
    await stripeBillingFormPost(
      secrets.secretKey,
      `/customers/${encodeURIComponent(customer.stripe_customer_id)}`,
      customerParams,
    );

    const subParams = new URLSearchParams();
    subParams.set('customer', customer.stripe_customer_id);
    subParams.set('items[0][price]', priceId);
    subParams.set('default_payment_method', pmId);
    subParams.set('payment_behavior', 'error_if_incomplete');
    subParams.set('metadata[speedvendors_user_id]', user.id);
    subParams.set('metadata[plan]', plan || (priceId === secrets.yearlyPriceId ? 'yearly' : 'monthly'));
    if (sessionId.startsWith('cs_test_')) {
      subParams.set('metadata[e2e_checkout_session_id]', sessionId);
    }

    const subscription = await stripeBillingFormPost(
      secrets.secretKey,
      '/subscriptions',
      subParams,
    );

    const subscriptionId = String(subscription.id || '');

    return json({
      status: sessionStatus === 'open' ? 'subscription_created_for_open_checkout' : 'subscription_created',
      session_id: sessionId || null,
      subscription_id: subscriptionId.startsWith('sub_') ? subscriptionId : null,
      price_id: priceId,
      subscription_status: subscription.status ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('billing-e2e-complete-checkout failed', { message });
    return json({ error: 'server_error', message }, 500);
  }
});
