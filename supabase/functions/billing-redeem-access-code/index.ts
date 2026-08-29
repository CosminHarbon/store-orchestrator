import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { hashAccessCode } from '../_shared/billingEntitlement.ts';
import { billingCorsHeaders } from '../_shared/billingStripe.ts';

const cors = billingCorsHeaders();

// Simple in-isolate rate limit (best-effort; not a substitute for WAF).
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const row = attempts.get(userId);
  if (!row || row.resetAt < now) {
    attempts.set(userId, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  row.count += 1;
  return row.count > 10;
}

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

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'unauthorized' }, 401);

    if (rateLimited(user.id)) {
      return json({ error: 'rate_limited' }, 429);
    }

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!code || code.length < 8 || code.length > 64) {
      return json({ error: 'invalid_code' }, 400);
    }

    const codeHash = await hashAccessCode(code);
    const { data, error } = await userClient.rpc('redeem_access_code_hash', {
      p_code_hash: codeHash,
    });

    if (error) {
      const msg = error.message || '';
      if (msg.includes('already_redeemed')) return json({ error: 'already_redeemed' }, 409);
      if (msg.includes('invalid_or_exhausted') || msg.includes('invalid_code')) {
        return json({ error: 'invalid_or_exhausted_code' }, 400);
      }
      console.error('redeem_access_code_hash failed', { message: msg });
      return json({ error: 'redeem_failed' }, 500);
    }

    console.log('access code redeemed', { user_id: user.id });
    return json({ ok: true, result: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('billing-redeem-access-code failed', { message });
    if (message === 'ACCESS_CODE_PEPPER_NOT_CONFIGURED') {
      return json({ error: 'billing_not_configured' }, 503);
    }
    return json({ error: 'server_error' }, 500);
  }
});
