import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { ensureBillingCustomer } from '../_shared/billingEntitlement.ts';
import {
  billingCorsHeaders,
  getBillingAppOrigin,
  getStripeBillingApiSecrets,
  stripeBillingFormPost,
  stripeEnvironmentLabel,
} from '../_shared/billingStripe.ts';

const cors = billingCorsHeaders();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
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

    // Never accept stripe_customer_id from the client; never use impersonation.
    const secrets = getStripeBillingApiSecrets();
    const admin = createClient(supabaseUrl, service);
    const customer = await ensureBillingCustomer({
      admin,
      userId: user.id,
      email: user.email,
    });

    const params = new URLSearchParams();
    params.set('customer', customer.stripe_customer_id);
    params.set('return_url', `${getBillingAppOrigin()}/app?tab=settings`);
    const configurationId = (Deno.env.get('STRIPE_PORTAL_CONFIGURATION_ID') || '').trim();
    if (configurationId.startsWith('bpc_')) {
      params.set('configuration', configurationId);
    }

    const portal = await stripeBillingFormPost(
      secrets.secretKey,
      '/billing_portal/sessions',
      params,
    );
    const url = typeof portal.url === 'string' ? portal.url : null;
    if (!url) return json({ error: 'portal_session_failed' }, 500);

    console.log('billing portal created', {
      user_id: user.id,
      stripe_environment: stripeEnvironmentLabel(secrets.livemode),
    });
    return json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('billing-create-portal-session failed', { message });
    if (message.includes('NOT_CONFIGURED') || message === 'APP_ORIGIN_MISSING') {
      return json({ error: 'billing_not_configured' }, 503);
    }
    return json({ error: 'server_error' }, 500);
  }
});
