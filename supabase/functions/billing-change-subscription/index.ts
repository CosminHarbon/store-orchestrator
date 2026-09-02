import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import {
  ensureBillingCustomer,
  findLocalOpenSubscription,
  refreshSubscriptionFromStripe,
} from '../_shared/billingEntitlement.ts';
import { identifyPrice, resolveSpeedVendorsPrice } from '../_shared/billingCatalog.ts';
import {
  billingCorsHeaders,
  getStripeBillingApiSecrets,
  isOpenBillingSubscriptionStatus,
  listStripeSubscriptionsForCustomer,
  retrieveSubscription,
  stripeBillingFormPost,
  stripeEnvironmentLabel,
} from '../_shared/billingStripe.ts';
import {
  classifyPlanChange,
  parseInterval,
  parseTier,
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

function isoToUnix(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return String(Math.floor(t / 1000));
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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.client_surface === 'native') {
      return json({ error: 'native_billing_blocked' }, 403);
    }
    if (typeof body.price_id === 'string' || body.amount != null) {
      return json({ error: 'invalid_plan' }, 400);
    }

    const tier = parseTier(typeof body.tier === 'string' ? body.tier : null);
    const interval = parseInterval(typeof body.interval === 'string' ? body.interval : null);
    if (!tier || !interval) return json({ error: 'invalid_plan' }, 400);

    const secrets = getStripeBillingApiSecrets();
    const admin = createClient(supabaseUrl, service);
    const customer = await ensureBillingCustomer({
      admin,
      userId: user.id,
      email: user.email,
    });

    const localOpen = await findLocalOpenSubscription(admin, user.id);
    const stripeSubs = await listStripeSubscriptionsForCustomer(
      secrets.secretKey,
      customer.stripe_customer_id,
    );
    const stripeOpen = stripeSubs.find((s) => isOpenBillingSubscriptionStatus(s.status));
    const subscriptionId = localOpen?.stripe_subscription_id || stripeOpen?.id;
    if (!subscriptionId) {
      return json({ error: 'no_active_subscription' }, 409);
    }

    const current = await retrieveSubscription(secrets.secretKey, subscriptionId);
    if (current.cancelAtPeriodEnd) {
      return json({ error: 'subscription_canceling' }, 409);
    }
    if (!isOpenBillingSubscriptionStatus(current.status) || current.status === 'incomplete') {
      return json({ error: 'subscription_not_changeable' }, 409);
    }

    const currentPlan = identifyPrice({
      priceId: current.priceId,
      lookupKey: current.lookupKey,
      metadata: current.priceMetadata,
      billingInterval: current.billingInterval,
    }) || {
      tier: (parseTier(localOpen?.tier) || 'start') as SpeedVendorsTier,
      interval: (parseInterval(localOpen?.plan) || 'monthly') as BillingInterval,
    };

    const kind = classifyPlanChange(currentPlan, { tier, interval });
    if (kind === 'noop') {
      return json({ ok: true, unchanged: true, tier, interval });
    }

    const target = await resolveSpeedVendorsPrice(secrets.secretKey, tier, interval, {
      allowCreate: !secrets.livemode,
    });
    if (!current.itemId) {
      return json({ error: 'subscription_item_missing' }, 500);
    }

    if (current.scheduleId && kind === 'upgrade') {
      try {
        await stripeBillingFormPost(
          secrets.secretKey,
          `/subscription_schedules/${encodeURIComponent(current.scheduleId)}/release`,
          new URLSearchParams(),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        console.error('release subscription schedule failed', { message });
      }
    }

    if (kind === 'upgrade') {
      const form = new URLSearchParams();
      form.set('items[0][id]', current.itemId);
      form.set('items[0][price]', target.priceId);
      form.set('proration_behavior', 'always_invoice');
      form.set('cancel_at_period_end', 'false');
      form.set('metadata[tier]', tier);
      form.set('metadata[billing_interval]', interval);
      form.set('metadata[lookup_key]', target.lookupKey);
      form.set('metadata[speedvendors_user_id]', user.id);
      await stripeBillingFormPost(
        secrets.secretKey,
        `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        form,
      );
    } else {
      const startUnix = isoToUnix(current.currentPeriodStart);
      const endUnix = isoToUnix(current.currentPeriodEnd);
      if (!current.priceId || !startUnix || !endUnix) {
        return json({ error: 'subscription_period_missing' }, 500);
      }

      let scheduleId = current.scheduleId;
      if (!scheduleId) {
        const created = await stripeBillingFormPost(
          secrets.secretKey,
          '/subscription_schedules',
          new URLSearchParams({ from_subscription: subscriptionId }),
        );
        scheduleId = typeof created.id === 'string' ? created.id : null;
      }
      if (!scheduleId?.startsWith('sub_sched_')) {
        return json({ error: 'schedule_create_failed' }, 500);
      }

      const form = new URLSearchParams();
      form.set('end_behavior', 'release');
      form.set('phases[0][items][0][price]', current.priceId);
      form.set('phases[0][items][0][quantity]', '1');
      form.set('phases[0][start_date]', startUnix);
      form.set('phases[0][end_date]', endUnix);
      form.set('phases[1][items][0][price]', target.priceId);
      form.set('phases[1][items][0][quantity]', '1');
      form.set('phases[1][metadata][tier]', tier);
      form.set('phases[1][metadata][billing_interval]', interval);
      await stripeBillingFormPost(
        secrets.secretKey,
        `/subscription_schedules/${encodeURIComponent(scheduleId)}`,
        form,
      );
    }

    const normalized = await refreshSubscriptionFromStripe(admin, subscriptionId);
    console.log('billing subscription changed', {
      user_id: user.id,
      kind,
      from_tier: currentPlan.tier,
      to_tier: tier,
      interval,
      stripe_environment: stripeEnvironmentLabel(secrets.livemode),
    });
    return json({
      ok: true,
      kind,
      tier,
      interval,
      status: normalized.status,
      current_period_end: normalized.currentPeriodEnd,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('billing-change-subscription failed', { message });
    if (message.includes('NOT_CONFIGURED') || message === 'STRIPE_PRICE_LOOKUP_FAILED') {
      return json({ error: 'billing_not_configured' }, 503);
    }
    return json({ error: 'server_error' }, 500);
  }
});
