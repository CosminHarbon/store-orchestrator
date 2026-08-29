import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function tokenMeta(token: string) {
  return { tokenLen: token.length, tokenPrefix: token.slice(0, 8) };
}

/**
 * Authenticated FCM token registration / device cleanup.
 * - Caller JWT is verified; ownership always = auth user (never client-supplied user_id).
 * - DB writes use service role so the same FCM token can be safely reassigned across accounts
 *   without weakening RLS for direct client access.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[register-push-token] missing Authorization');
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
      console.error('[register-push-token] invalid auth', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'register');
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date().toISOString();

    // Logout / leave login screen: deactivate this device for the outgoing user only.
    if (action === 'deactivate') {
      const deviceId = body.device_id ? String(body.device_id) : null;
      const token = String(body.token || body.device_token || '').trim();

      if (!deviceId && !token) {
        return new Response(JSON.stringify({ error: 'device_id or token is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let query = admin
        .from('push_tokens')
        .update({ is_active: false, updated_at: now })
        .eq('user_id', user.id)
        .eq('provider', 'fcm')
        .eq('is_active', true);

      // Prefer stable install id; fall back to exact token if device_id missing.
      if (deviceId) {
        query = query.eq('device_id', deviceId);
      } else {
        query = query.eq('device_token', token);
      }

      const { data, error } = await query.select('id');
      if (error) {
        console.error('[register-push-token] deactivate failed', {
          userId: user.id,
          deviceId,
          details: error.message,
        });
        return new Response(JSON.stringify({ error: 'Failed to deactivate token', details: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('[register-push-token] deactivated', {
        userId: user.id,
        deviceId,
        count: data?.length ?? 0,
      });
      return new Response(JSON.stringify({ success: true, deactivated: data?.length ?? 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = String(body.token || body.device_token || '').trim();
    const platform = body.platform as string;
    const deviceId = body.device_id ? String(body.device_id) : null;

    if (!token) {
      return new Response(JSON.stringify({ error: 'token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (platform !== 'ios' && platform !== 'android') {
      return new Response(JSON.stringify({ error: 'platform must be ios or android' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Defensive: Capacitor may still emit APNs hex if Firebase wiring is wrong.
    if (platform === 'ios' && /^[0-9A-Fa-f]{64}$/.test(token)) {
      console.error('[register-push-token] rejecting APNs hex token', {
        userId: user.id,
        platform,
        ...tokenMeta(token),
      });
      return new Response(
        JSON.stringify({
          error: 'Invalid iOS token',
          message: 'Received APNs hex token; FCM registration token is required',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Look up prior owner for transfer logging (same physical device / same FCM token).
    const { data: existing } = await admin
      .from('push_tokens')
      .select('id, user_id, is_active')
      .eq('device_token', token)
      .maybeSingle();

    const previousUserId = existing?.user_id ?? null;
    const transferred = Boolean(previousUserId && previousUserId !== user.id);

    const { error } = await admin.from('push_tokens').upsert(
      {
        user_id: user.id,
        device_token: token,
        platform,
        device_id: deviceId,
        provider: 'fcm',
        is_active: true,
        onesignal_player_id: null,
        updated_at: now,
      },
      { onConflict: 'device_token' }
    );

    if (error) {
      console.error('[register-push-token] upsert failed', {
        userId: user.id,
        platform,
        ...tokenMeta(token),
        details: error.message,
      });
      return new Response(JSON.stringify({ error: 'Failed to register token', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Same install may have rotated FCM strings — deactivate other active FCM rows for this device.
    if (deviceId) {
      const { error: rotateError } = await admin
        .from('push_tokens')
        .update({ is_active: false, updated_at: now })
        .eq('provider', 'fcm')
        .eq('device_id', deviceId)
        .eq('is_active', true)
        .neq('device_token', token);

      if (rotateError) {
        console.error('[register-push-token] rotation deactivate failed', {
          userId: user.id,
          deviceId,
          details: rotateError.message,
        });
      }
    }

    console.log('[register-push-token] ok', {
      userId: user.id,
      platform,
      provider: 'fcm',
      deviceId,
      transferred,
      previousUserId: transferred ? previousUserId : null,
      ...tokenMeta(token),
    });
    return new Response(
      JSON.stringify({
        success: true,
        transferred,
        previous_user_id: transferred ? previousUserId : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[register-push-token] error', String(error));
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
