import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { refreshSubscriptionFromStripe } from '../_shared/billingEntitlement.ts';
import { billingCorsHeaders } from '../_shared/billingStripe.ts';

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
  // Gateway already verified the JWT when verify_jwt=true.
  return jwtRole(token) === 'service_role';
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
      const { data: isSuper, error: roleError } = await userClient.rpc('is_superadmin');
      if (roleError || !isSuper) return json({ error: 'forbidden' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const rawIds = Array.isArray(body.subscription_ids) ? body.subscription_ids : [];
    const subscriptionIds = rawIds.filter(
      (id: unknown): id is string => typeof id === 'string' && id.startsWith('sub_'),
    );
    if (subscriptionIds.length === 0) {
      return json({ error: 'subscription_ids_required' }, 400);
    }
    if (subscriptionIds.length > 20) {
      return json({ error: 'too_many_subscription_ids' }, 400);
    }

    const results = [];
    for (const subscriptionId of subscriptionIds) {
      try {
        const normalized = await refreshSubscriptionFromStripe(admin, subscriptionId);
        results.push({
          subscription_id: subscriptionId,
          ok: true,
          status: normalized.status,
          cancel_at_period_end: normalized.cancelAtPeriodEnd,
          current_period_end: normalized.currentPeriodEnd,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        console.error('billing-admin-sync-subscription item failed', {
          subscription_prefix: subscriptionId.slice(0, 8),
          message,
        });
        results.push({
          subscription_id: subscriptionId,
          ok: false,
          error: message === 'UNKNOWN_CUSTOMER' || message === 'SUBSCRIPTION_SYNC_FAILED'
            ? message
            : 'SYNC_FAILED',
        });
      }
    }

    return json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('billing-admin-sync-subscription failed', { message });
    return json({ error: 'server_error' }, 500);
  }
});
