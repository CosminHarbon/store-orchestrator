/**
 * Server-side authorisation for platform-admin Edge Functions.
 *
 * A caller is a platform superadmin only if `public.is_superadmin()` — evaluated by Postgres
 * against THEIR JWT — returns true: role = superadmin AND aal2 (MFA verified). The role is
 * never taken from the request body or from client state.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export type AuthenticatedAdmin = {
  userId: string;
  email: string | null;
  jwt: string;
  userClient: AnyClient;
  admin: AnyClient;
};

export type AdminAuthFailure = { status: number; error: string };

export function bearerToken(req: Request): string {
  return (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the request carries the project's service-role key (cron / server-to-server). */
export function isServiceRoleRequest(req: Request): boolean {
  const token = bearerToken(req);
  const service = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  return token.length > 0 && service.length > 0 && safeEqual(token, service);
}

/**
 * Seconds since the most recent TOTP (MFA) verification recorded in the JWT `amr` claim,
 * or null if there is none. Signature validity is guaranteed by getUser() having accepted
 * the token; this only reads a claim from an already-verified token.
 */
export function secondsSinceMfa(jwt: string): number | null {
  const amr = jwtPayload(jwt)?.amr;
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr) {
    if (entry && typeof entry === 'object' && (entry as { method?: unknown }).method === 'totp') {
      const ts = Number((entry as { timestamp?: unknown }).timestamp);
      if (Number.isFinite(ts) && (latest === null || ts > latest)) latest = ts;
    }
  }
  if (latest === null) return null;
  return Math.max(0, Math.floor(Date.now() / 1000) - latest);
}

export async function authenticateSuperadmin(
  req: Request,
): Promise<{ ok: true; value: AuthenticatedAdmin } | { ok: false; failure: AdminAuthFailure }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { ok: false, failure: { status: 401, error: 'unauthorized' } };

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
  if (authError || !user) return { ok: false, failure: { status: 401, error: 'unauthorized' } };

  const { data: isSuper, error: roleError } = await userClient.rpc('is_superadmin');
  if (roleError || isSuper !== true) {
    return { ok: false, failure: { status: 403, error: 'forbidden' } };
  }

  return {
    ok: true,
    value: {
      userId: user.id,
      email: user.email ?? null,
      jwt: bearerToken(req),
      userClient,
      admin: createClient(supabaseUrl, service),
    },
  };
}

export async function writeAdminAudit(
  admin: AnyClient,
  row: {
    adminUserId: string;
    adminEmail: string | null;
    action: string;
    targetUserId: string | null;
    targetEmail: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<boolean> {
  const { error } = await admin.from('admin_audit_log').insert({
    admin_user_id: row.adminUserId,
    admin_email: row.adminEmail,
    action: row.action,
    target_user_id: row.targetUserId,
    target_email: row.targetEmail,
    metadata: row.metadata ?? {},
  });
  if (error) {
    console.error('admin_audit_log insert failed', { action: row.action, message: error.message });
    return false;
  }
  return true;
}
