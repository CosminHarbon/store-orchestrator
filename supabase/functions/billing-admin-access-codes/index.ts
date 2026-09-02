import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import {
  generateAccessCodePlaintext,
  hashAccessCode,
} from '../_shared/billingEntitlement.ts';
import { billingCorsHeaders } from '../_shared/billingStripe.ts';

const cors = billingCorsHeaders();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function codePrefixFromPlaintext(plaintext: string): string {
  const parts = plaintext.trim().toUpperCase().split('-');
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return plaintext.slice(0, 7).toUpperCase();
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
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceRole = isServiceRoleRequest(req);

    let actorUserId: string | null = null;
    if (!serviceRole) {
      const userClient = createClient(supabaseUrl, anon, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: authError,
      } = await userClient.auth.getUser();
      if (authError || !user) return json({ error: 'unauthorized' }, 401);

      const { data: isSuper, error: roleError } = await userClient.rpc('is_superadmin');
      if (roleError || !isSuper) {
        return json({ error: 'forbidden' }, 403);
      }
      actorUserId = user.id;
    }

    const admin = createClient(supabaseUrl, service);
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : 'list';

    if (action === 'list') {
      const { data, error } = await admin
        .from('access_codes')
        .select(
          'id, code_prefix, label, active, expires_at, access_duration_days, max_redemptions, redemption_count, created_at, created_by',
        )
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) {
        console.error('access_codes list failed', { message: error.message });
        return json({ error: 'list_failed' }, 500);
      }
      return json({ codes: data || [] });
    }

    if (action === 'create') {
      const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : '';
      if (!label) return json({ error: 'label_required' }, 400);

      const permanent = body.permanent === true;
      let durationDays: number | null = null;
      if (!permanent) {
        const raw = Number(body.access_duration_days);
        if (!Number.isInteger(raw) || raw < 1 || raw > 3650) {
          return json({ error: 'invalid_duration' }, 400);
        }
        durationDays = raw;
      }

      let expiresAt: string | null = null;
      if (typeof body.expires_at === 'string' && body.expires_at.trim()) {
        const parsed = new Date(body.expires_at);
        if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
          return json({ error: 'invalid_expires_at' }, 400);
        }
        expiresAt = parsed.toISOString();
      }

      let maxRedemptions: number | null = null;
      if (body.max_redemptions !== null && body.max_redemptions !== undefined && body.max_redemptions !== '') {
        const raw = Number(body.max_redemptions);
        if (!Number.isInteger(raw) || raw < 1 || raw > 10000) {
          return json({ error: 'invalid_max_redemptions' }, 400);
        }
        maxRedemptions = raw;
      }

      const plaintext = generateAccessCodePlaintext();
      const codeHash = await hashAccessCode(plaintext);
      const codePrefix = codePrefixFromPlaintext(plaintext);

      const { data: inserted, error } = await admin
        .from('access_codes')
        .insert({
          code_hash: codeHash,
          code_prefix: codePrefix,
          label,
          active: true,
          expires_at: expiresAt,
          access_duration_days: durationDays,
          max_redemptions: maxRedemptions,
          created_by: actorUserId,
          metadata: { created_via: 'admin_console' },
        })
        .select(
          'id, code_prefix, label, active, expires_at, access_duration_days, max_redemptions, redemption_count, created_at, created_by',
        )
        .single();

      if (error || !inserted) {
        console.error('access_codes insert failed', { message: error?.message });
        return json({ error: 'create_failed' }, 500);
      }

      return json({
        code: inserted,
        plaintext,
        shown_once: true,
      });
    }

    if (action === 'set_active') {
      const codeId = typeof body.code_id === 'string' ? body.code_id : '';
      if (!codeId) return json({ error: 'code_id_required' }, 400);
      const active = body.active === true;
      const { data, error } = await admin
        .from('access_codes')
        .update({ active, updated_at: new Date().toISOString() })
        .eq('id', codeId)
        .select(
          'id, code_prefix, label, active, expires_at, access_duration_days, max_redemptions, redemption_count, created_at, created_by',
        )
        .single();
      if (error || !data) {
        console.error('access_codes set_active failed', { message: error?.message });
        return json({ error: 'update_failed' }, 500);
      }
      return json({ code: data });
    }

    if (action === 'redemptions') {
      const codeId = typeof body.code_id === 'string' ? body.code_id : '';
      if (!codeId) return json({ error: 'code_id_required' }, 400);

      const { data: rows, error } = await admin
        .from('access_code_redemptions')
        .select('id, user_id, entitlement_id, redeemed_at, revoked_at')
        .eq('code_id', codeId)
        .order('redeemed_at', { ascending: false })
        .limit(200);
      if (error) {
        console.error('access_code_redemptions list failed', { message: error.message });
        return json({ error: 'list_failed' }, 500);
      }

      const redemptions = [];
      for (const row of rows || []) {
        const { data: userData } = await admin.auth.admin.getUserById(row.user_id);
        let entitlementStatus: string | null = null;
        let validUntil: string | null = null;
        if (row.entitlement_id) {
          const { data: ent } = await admin
            .from('entitlements')
            .select('status, valid_until')
            .eq('id', row.entitlement_id)
            .maybeSingle();
          entitlementStatus = ent?.status ?? null;
          validUntil = ent?.valid_until ?? null;
        }
        redemptions.push({
          id: row.id,
          user_id: row.user_id,
          email: userData.user?.email || null,
          redeemed_at: row.redeemed_at,
          revoked_at: row.revoked_at,
          entitlement_id: row.entitlement_id,
          entitlement_status: entitlementStatus,
          valid_until: validUntil,
        });
      }

      return json({ redemptions });
    }

    if (action === 'revoke_redemption') {
      const redemptionId = typeof body.redemption_id === 'string' ? body.redemption_id : '';
      if (!redemptionId) return json({ error: 'redemption_id_required' }, 400);

      const { data: redemption, error: selErr } = await admin
        .from('access_code_redemptions')
        .select('id, entitlement_id, revoked_at')
        .eq('id', redemptionId)
        .maybeSingle();
      if (selErr || !redemption) return json({ error: 'not_found' }, 404);
      if (redemption.revoked_at) return json({ error: 'already_revoked' }, 409);

      const now = new Date().toISOString();
      const { error: revErr } = await admin
        .from('access_code_redemptions')
        .update({ revoked_at: now })
        .eq('id', redemptionId);
      if (revErr) {
        console.error('redemption revoke failed', { message: revErr.message });
        return json({ error: 'revoke_failed' }, 500);
      }

      if (redemption.entitlement_id) {
        const { data: ent } = await admin
          .from('entitlements')
          .select('metadata')
          .eq('id', redemption.entitlement_id)
          .maybeSingle();
        const prevMeta =
          ent?.metadata && typeof ent.metadata === 'object' ? (ent.metadata as Record<string, unknown>) : {};
        const { error: entErr } = await admin
          .from('entitlements')
          .update({
            status: 'revoked',
            updated_at: now,
            metadata: {
              ...prevMeta,
              revoked_by: actorUserId,
              revoked_via: 'admin_console',
              revoked_at: now,
            },
          })
          .eq('id', redemption.entitlement_id)
          .eq('source', 'access_code');
        if (entErr) {
          console.error('entitlement revoke failed', { message: entErr.message });
          return json({ error: 'revoke_failed' }, 500);
        }
      }

      return json({ ok: true, redemption_id: redemptionId });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('billing-admin-access-codes failed', { message });
    if (message === 'ACCESS_CODE_PEPPER_NOT_CONFIGURED') {
      return json({ error: 'billing_not_configured' }, 503);
    }
    return json({ error: 'server_error' }, 500);
  }
});
