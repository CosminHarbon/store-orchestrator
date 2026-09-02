import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { isSuperadminUserId } from '../_shared/billingEntitlement.ts';
import {
  ensureCustomerPortalConfiguration,
  ensureSpeedVendorsCatalogue,
  inspectLiveBillingOps,
  inspectLivePurchase,
  inspectProductPriceInventory,
  inspectStripeTax,
  resolveSpeedVendorsPriceMap,
} from '../_shared/billingCatalog.ts';
import {
  parseSandboxPlan,
  sandboxCancelAtPeriodEnd,
  sandboxCreateCheckout,
  sandboxExpireOpenCheckouts,
  sandboxFailPayment,
  sandboxSubscribe,
} from '../_shared/billingSandbox.ts';
import {
  billingCorsHeaders,
  getBillingAppOrigin,
  getStripeBillingApiSecrets,
  inspectBillingSecretKinds,
  stripeEnvironmentLabel,
} from '../_shared/billingStripe.ts';

const cors = billingCorsHeaders();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function bearerToken(req: Request): string {
  return (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function jwtRole(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function isServiceRoleRequest(req: Request): boolean {
  const token = bearerToken(req);
  const service = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  if (token.length > 0 && service.length > 0 && token === service) return true;
  return jwtRole(token) === 'service_role';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, service);

    if (!isServiceRoleRequest(req)) {
      const userClient = createClient(supabaseUrl, anon, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: authError,
      } = await userClient.auth.getUser();
      if (authError || !user) return json({ error: 'unauthorized' }, 401);
      if (!(await isSuperadminUserId(admin, user.id))) {
        return json({ error: 'forbidden' }, 403);
      }
    }

    const secrets = getStripeBillingApiSecrets();
    const stripeEnv = stripeEnvironmentLabel(secrets.livemode);
    const body = req.method === 'POST'
      ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
      : {};
    const action = typeof body.action === 'string' ? body.action : 'inspect';
    const serviceRole = isServiceRoleRequest(req);

    if (action === 'inspect_live_purchase') {
      if (!serviceRole) return json({ error: 'forbidden' }, 403);
      const subscriptionId = typeof body.subscription_id === 'string' ? body.subscription_id.trim() : '';
      if (!subscriptionId.startsWith('sub_')) {
        return json({ error: 'subscription_id_required' }, 400);
      }
      const eventIds = Array.isArray(body.event_ids)
        ? body.event_ids.filter((id): id is string => typeof id === 'string' && id.startsWith('evt_'))
        : [];
      const report = await inspectLivePurchase({
        secretKey: secrets.secretKey,
        subscriptionId,
        eventIds,
        createPortalSession: body.create_portal_session === true,
      });
      return json({ ok: true, stripe_environment: stripeEnv, livemode: secrets.livemode, ...report });
    }

    if (action.startsWith('sandbox_')) {
      if (!serviceRole) return json({ error: 'forbidden' }, 403);
      if (secrets.livemode) return json({ error: 'live_sandbox_action_blocked' }, 409);
      const userId = typeof body.user_id === 'string' ? body.user_id : '';
      if (!userId) return json({ error: 'user_id_required' }, 400);
      const { data: userRow } = await admin.auth.admin.getUserById(userId);
      const email = userRow?.user?.email || null;

      if (action === 'sandbox_subscribe') {
        const plan = parseSandboxPlan(body);
        if (!plan) return json({ error: 'invalid_plan' }, 400);
        const result = await sandboxSubscribe({
          admin,
          secretKey: secrets.secretKey,
          userId,
          email,
          tier: plan.tier,
          interval: plan.interval,
        });
        return json({ ok: true, ...result, stripe_environment: stripeEnv });
      }
      if (action === 'sandbox_checkout') {
        const plan = parseSandboxPlan(body);
        if (!plan) return json({ error: 'invalid_plan' }, 400);
        const result = await sandboxCreateCheckout({
          admin,
          secretKey: secrets.secretKey,
          userId,
          email,
          tier: plan.tier,
          interval: plan.interval,
        });
        return json({ ok: true, ...result, stripe_environment: stripeEnv });
      }
      if (action === 'sandbox_expire_checkouts') {
        const expired = await sandboxExpireOpenCheckouts({
          admin,
          secretKey: secrets.secretKey,
          userId,
        });
        return json({ ok: true, expired, stripe_environment: stripeEnv });
      }
      if (action === 'sandbox_cancel') {
        const result = await sandboxCancelAtPeriodEnd({
          admin,
          secretKey: secrets.secretKey,
          userId,
        });
        return json({ ok: true, ...result, stripe_environment: stripeEnv });
      }
      if (action === 'sandbox_fail_payment') {
        const result = await sandboxFailPayment({
          admin,
          secretKey: secrets.secretKey,
          userId,
        });
        return json({ ok: true, ...result, stripe_environment: stripeEnv });
      }
      return json({ error: 'unknown_sandbox_action' }, 400);
    }

    const existing = await resolveSpeedVendorsPriceMap(secrets.secretKey);
    const productIdFromPrices = Object.values(existing).find((p) => p?.productId)?.productId || null;
    const tax = await inspectStripeTax(secrets.secretKey, productIdFromPrices);
    const ops = await inspectLiveBillingOps(secrets.secretKey);
    const inventory = await inspectProductPriceInventory(secrets.secretKey, productIdFromPrices);

    if (action !== 'ensure' && action !== 'ensure_live') {
      console.log('billing catalog inspect', { stripe_environment: stripeEnv });
      return json({
        stripe_environment: stripeEnv,
        livemode: secrets.livemode,
        secret_key_live_prefix: secrets.secretKey.startsWith('sk_live_'),
        prices: existing,
        tax,
        ops,
        inventory,
      });
    }

    if (action === 'ensure_live' && !secrets.livemode) {
      return json({
        error: 'live_secret_required',
        stripe_environment: stripeEnv,
        hint: 'Set STRIPE_BILLING_SECRET_KEY to the live billing key (sk_live_...) in Supabase Edge Function secrets before creating the live catalogue. Do not put it in STRIPE_SECRET_KEY.',
      }, 409);
    }

    if (action === 'ensure' && secrets.livemode) {
      return json({
        error: 'live_catalog_blocked',
        stripe_environment: stripeEnv,
        hint: 'Use action=ensure_live with the live billing secret. Sandbox ensure is blocked while the secret is live.',
      }, 409);
    }

    const catalogue = await ensureSpeedVendorsCatalogue(secrets.secretKey);
    let portal: { id: string; isDefault: boolean } | null = null;
    let portalError: string | null = null;
    try {
      const origin = getBillingAppOrigin();
      portal = await ensureCustomerPortalConfiguration(
        secrets.secretKey,
        catalogue.prices[0]?.productId || catalogue.productId,
        catalogue.prices,
        `${origin}/app?tab=settings`,
      );
    } catch (err) {
      portalError = err instanceof Error ? err.message : 'PORTAL_CONFIG_FAILED';
      console.error('billing catalog portal config failed', { message: portalError });
    }

    console.log('billing catalog ensured', {
      stripe_environment: stripeEnv,
      product_id: catalogue.productId,
      price_count: catalogue.prices.length,
      portal_id: portal?.id || null,
    });

    return json({
      stripe_environment: stripeEnv,
      livemode: secrets.livemode,
      product_id: catalogue.productId,
      prices: catalogue.prices,
      archived_price_ids: catalogue.archivedPriceIds,
      portal,
      portal_error: portalError,
      tax,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('billing-admin-catalog failed', { message });
    if (message.includes('NOT_CONFIGURED') || message === 'APP_ORIGIN_MISSING') {
      return json({
        error: 'billing_not_configured',
        ...inspectBillingSecretKinds(),
      }, 503);
    }
    return json({ error: 'server_error' }, 500);
  }
});
