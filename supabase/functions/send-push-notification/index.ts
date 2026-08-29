import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getGoogleAccessToken,
  loadFirebaseServiceAccount,
  sendFcmMessage,
} from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-push-internal-secret',
};

type RequestBody = {
  user_id?: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
};

/**
 * FCM HTTP v1 sender. Trusted callers only:
 * - Service-role bearer (Edge Function → Edge Function)
 * - Optional x-push-internal-secret matching PUSH_INTERNAL_SECRET
 * - Authenticated user sending ONLY to their own user_id (self-test)
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sa = loadFirebaseServiceAccount();
    if (!sa) {
      console.error('[send-push-notification] Firebase credentials not loaded');
      return new Response(
        JSON.stringify({
          error: 'Firebase credentials not configured',
          hint: 'Set FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY) as Edge Function secrets',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('[send-push-notification] Firebase SA loaded', {
      projectId: sa.project_id,
      clientEmailPresent: Boolean(sa.client_email),
      privateKeyPresent: Boolean(sa.private_key),
    });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const INTERNAL_SECRET = Deno.env.get('PUSH_INTERNAL_SECRET');

    const authHeader = req.headers.get('Authorization') || '';
    const internalHeader = req.headers.get('x-push-internal-secret') || '';
    const payload: RequestBody = await req.json();

    const title = payload.title?.trim();
    const bodyText = payload.body?.trim();
    const targetUserId = payload.user_id?.trim();

    if (!title || !bodyText) {
      return new Response(JSON.stringify({ error: 'title and body are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const isServiceRole = Boolean(SUPABASE_SERVICE_ROLE_KEY && bearerToken === SUPABASE_SERVICE_ROLE_KEY);
    const isInternal = Boolean(INTERNAL_SECRET && internalHeader === INTERNAL_SECRET);

    let callerUserId: string | null = null;
    if (!isServiceRole && !isInternal) {
      if (!authHeader) {
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
        error,
      } = await userClient.auth.getUser();
      if (error || !user) {
        console.error('[send-push-notification] invalid auth', error?.message);
        return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      callerUserId = user.id;
      if (callerUserId !== targetUserId) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: cannot send push to another user' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: tokens, error: tokensError } = await admin
      .from('push_tokens')
      .select('id, device_token, platform, provider')
      .eq('user_id', targetUserId)
      .eq('provider', 'fcm')
      .eq('is_active', true);

    if (tokensError) {
      console.error('[send-push-notification] token query failed', {
        userId: targetUserId,
        details: tokensError.message,
      });
      return new Response(JSON.stringify({ error: 'Failed to load tokens', details: tokensError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[send-push-notification] tokens loaded', {
      userId: targetUserId,
      tokenCount: tokens?.length ?? 0,
      platforms: (tokens || []).map((t) => t.platform),
      providers: (tokens || []).map((t) => t.provider),
    });

    if (!tokens?.length) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No active FCM tokens for user',
          sent: 0,
          total: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken(sa);
      console.log('[send-push-notification] OAuth access token obtained');
    } catch (oauthError) {
      console.error('[send-push-notification] OAuth failed', String(oauthError));
      return new Response(
        JSON.stringify({
          error: 'Failed to obtain Google access token',
          details: String(oauthError),
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];
    let sent = 0;

    for (const row of tokens) {
      const result = await sendFcmMessage({
        accessToken,
        projectId: sa.project_id,
        token: row.device_token,
        title,
        body: bodyText,
        data: payload.data,
      });
      results.push({
        platform: row.platform,
        success: result.success,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        tokenLen: row.device_token.length,
        tokenPrefix: row.device_token.slice(0, 8),
      });

      console.log('[send-push-notification] FCM result', {
        userId: targetUserId,
        platform: row.platform,
        success: result.success,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        tokenLen: row.device_token.length,
        tokenPrefix: row.device_token.slice(0, 8),
      });

      if (result.success) {
        sent += 1;
      } else if (result.shouldRemoveToken) {
        await admin
          .from('push_tokens')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        console.log('[send-push-notification] deactivated invalid token', { id: row.id });
      }
    }

    return new Response(
      JSON.stringify({
        success: sent > 0,
        sent,
        total: tokens.length,
        results,
        caller: callerUserId ? 'user' : isInternal ? 'internal' : 'service_role',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[send-push-notification] error', String(error));
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
