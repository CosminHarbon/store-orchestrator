import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import {
  isBillingEnforcementActive,
  isSuperadminUserId,
  userHasActiveEntitlement,
} from '../_shared/billingEntitlement.ts';
import { billingCorsHeaders } from '../_shared/billingStripe.ts';

const cors = billingCorsHeaders();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

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

    // Own status only — no user_id query param.
    const { data: rpcStatus, error: rpcError } = await userClient.rpc(
      'get_my_entitlement_status',
    );
    if (rpcError) {
      console.error('get_my_entitlement_status failed', { message: rpcError.message });
      return json({ error: 'status_failed' }, 500);
    }

    const admin = createClient(supabaseUrl, service);
    const enforcementActive = await isBillingEnforcementActive(admin);
    const superadmin = await isSuperadminUserId(admin, user.id);
    const hasEntitlement = await userHasActiveEntitlement(admin, user.id);
    const hasAccess = !enforcementActive || superadmin || hasEntitlement;

    return json({
      ...(typeof rpcStatus === 'object' && rpcStatus ? rpcStatus : {}),
      // Edge env ∧ DB flag (stricter than DB-only RPC when env still false).
      enforcement_active: enforcementActive,
      has_access: hasAccess,
      has_entitlement: hasEntitlement,
      is_superadmin: superadmin,
      email_verified: Boolean(
        (user as { email_confirmed_at?: string | null }).email_confirmed_at ||
          (user as { confirmed_at?: string | null }).confirmed_at,
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('billing-entitlement-status failed', { message });
    return json({ error: 'server_error' }, 500);
  }
});
