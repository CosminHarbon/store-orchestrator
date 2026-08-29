import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Super Admin self-test only (role + MFA AAL2 via public.is_superadmin()).
 * Always targets the caller — never another merchant.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[send-test-push] missing Authorization');
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      console.error('[send-test-push] invalid auth', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Server-side Super Admin gate (user_roles.superadmin + JWT aal=aal2).
    // Merchants must not be able to invoke this diagnostic endpoint directly.
    const { data: isSuper, error: roleError } = await userClient.rpc('is_superadmin');
    if (roleError || !isSuper) {
      console.error('[send-test-push] forbidden', {
        userId: user.id,
        roleError: roleError?.message,
      });
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: 'send-test-push is restricted to Super Admin accounts',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const title = String(body.title || 'SpeedVendors test notification');
    const message = String(body.body || 'Push infrastructure is working on this device.');
    const data = (body.data || { type: 'test', id: 'self-test' }) as Record<string, string>;

    console.log('[send-test-push] forwarding', { userId: user.id, title });

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: user.id,
        title,
        body: message,
        data,
      }),
    });

    const result = await response.json().catch(() => ({
      error: 'Invalid JSON from send-push-notification',
    }));

    console.log('[send-test-push] upstream', {
      userId: user.id,
      status: response.status,
      success: (result as { success?: boolean })?.success,
      sent: (result as { sent?: number })?.sent,
      message: (result as { message?: string })?.message,
      error: (result as { error?: string })?.error,
    });

    return new Response(JSON.stringify(result), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[send-test-push] error', String(error));
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
