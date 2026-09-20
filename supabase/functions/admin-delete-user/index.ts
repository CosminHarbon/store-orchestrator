import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  authenticateSuperadmin,
  secondsSinceMfa,
  writeAdminAudit,
} from '../_shared/adminAuth.ts';
import { cleanupNonCascadingTables } from '../_shared/accountCleanup.ts';
import { billingCorsHeaders } from '../_shared/billingStripe.ts';

/**
 * Permanently delete a merchant account. Superadmin only; runs with the service role on the
 * server so no admin credential ever reaches the browser.
 *
 * Order of operations (each step gates the next):
 *   1. Authenticate the caller; Postgres must confirm role = superadmin AND aal2 (MFA).
 *   2. Require a recent TOTP verification (amr claim, <= 5 min) — the client re-challenges MFA
 *      immediately before calling this. Otherwise: 403 reauth_required.
 *   3. Validate the target and re-verify the typed confirmations server-side, so the UI's
 *      multi-step flow cannot be bypassed by calling this endpoint directly.
 *   4. Refuse: self-deletion, other superadmins, accounts with an open paid subscription.
 *   5. Write an audit row ("started"). If that fails, nothing is deleted.
 *   6. Snapshot legally retained records (invoiced / paid orders, items, payments, billing
 *      history) into deleted_account_archive — the FKs from auth.users cascade.
 *   7. Remove the merchant's storage objects, then delete the auth user (cascades the rest).
 *   8. Verify nothing is left behind and write the final audit row.
 */

const cors = billingCorsHeaders();
const MFA_MAX_AGE_SECONDS = 300;
const OPEN_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'];

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
    // 1. Authenticate + authorise
    const auth = await authenticateSuperadmin(req);
    if (!auth.ok) return json({ error: auth.failure.error }, auth.failure.status);
    const { admin, userId: adminId, email: adminEmail, jwt } = auth.value;

    // 2. Recent re-authentication
    const mfaAge = secondsSinceMfa(jwt);
    if (mfaAge === null || mfaAge > MFA_MAX_AGE_SECONDS) {
      return json({ error: 'reauth_required', max_age_seconds: MFA_MAX_AGE_SECONDS }, 403);
    }

    // 3. Validate input
    const body = await req.json().catch(() => ({}));
    const targetId = typeof body.target_user_id === 'string' ? body.target_user_id.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
      return json({ error: 'invalid_user_id' }, 400);
    }
    if (body.acknowledged !== true) return json({ error: 'acknowledgement_required' }, 400);
    if (body.confirm_phrase !== 'DELETE') return json({ error: 'confirmation_phrase_mismatch' }, 400);

    // 4. Guards
    if (targetId === adminId) return json({ error: 'cannot_delete_self' }, 400);

    const { data: targetRes, error: targetErr } = await admin.auth.admin.getUserById(targetId);
    const target = targetRes?.user;
    if (targetErr || !target) return json({ error: 'user_not_found' }, 404);

    const targetEmail = target.email ?? '';
    if (!targetEmail || body.confirm_email !== targetEmail) {
      return json({ error: 'email_confirmation_mismatch' }, 400);
    }

    const { data: targetRole } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', targetId)
      .eq('role', 'superadmin')
      .maybeSingle();
    if (targetRole) return json({ error: 'cannot_delete_superadmin' }, 403);

    const { data: openSubs, error: subErr } = await admin
      .from('billing_subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', targetId)
      .in('status', OPEN_SUBSCRIPTION_STATUSES)
      .limit(5);
    if (subErr) return json({ error: 'subscription_check_failed' }, 500);
    if (openSubs && openSubs.length > 0) {
      return json(
        {
          error: 'active_subscription',
          message:
            'This account has an open SpeedVendors subscription. Cancel it in Stripe (customer portal) first so the customer is not billed after deletion.',
        },
        409,
      );
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('store_name')
      .eq('user_id', targetId)
      .maybeSingle();
    const { data: connect } = await admin
      .from('payment_integrations')
      .select('provider, provider_account_id, status')
      .eq('user_id', targetId)
      .not('provider_account_id', 'is', null);

    const { data: rowsBefore } = await admin.rpc('count_user_rows', { p_user_id: targetId });

    // 5. Audit "started" — fail closed
    const startedOk = await writeAdminAudit(admin, {
      adminUserId: adminId,
      adminEmail,
      action: 'user_delete_started',
      targetUserId: targetId,
      targetEmail,
      metadata: {
        store_name: profile?.store_name ?? null,
        rows_before: rowsBefore ?? {},
        stripe_connect_accounts: (connect ?? []).map((c: { provider_account_id: string }) => c.provider_account_id),
        mfa_age_seconds: mfaAge,
      },
    });
    if (!startedOk) return json({ error: 'audit_unavailable' }, 500);

    // 6. Archive retained financial records
    const { data: archived, error: archiveErr } = await admin.rpc('admin_archive_account_for_deletion', {
      p_user_id: targetId,
      p_deleted_by: adminId,
    });
    if (archiveErr) {
      console.error('archive failed', { message: archiveErr.message });
      await writeAdminAudit(admin, {
        adminUserId: adminId,
        adminEmail,
        action: 'user_delete_failed',
        targetUserId: targetId,
        targetEmail,
        metadata: { stage: 'archive', message: archiveErr.message },
      });
      return json({ error: 'archive_failed' }, 500);
    }

    // 7a. Storage objects (media_assets is the canonical path registry)
    const storageRemoved: Record<string, number> = {};
    const storageErrors: string[] = [];
    const { data: assets } = await admin
      .from('media_assets')
      .select('bucket, storage_path')
      .eq('user_id', targetId)
      .limit(10000);
    const byBucket = new Map<string, string[]>();
    for (const a of (assets ?? []) as Array<{ bucket: string; storage_path: string }>) {
      const list = byBucket.get(a.bucket) ?? [];
      list.push(a.storage_path);
      byBucket.set(a.bucket, list);
    }
    for (const [bucket, paths] of byBucket) {
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { error: rmErr } = await admin.storage.from(bucket).remove(chunk);
        if (rmErr) storageErrors.push(`${bucket}: ${rmErr.message}`);
        else storageRemoved[bucket] = (storageRemoved[bucket] ?? 0) + chunk.length;
      }
    }

    // 7b. Delete the auth user (server-side admin API; cascades merchant data)
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      console.error('deleteUser failed', { message: delErr.message });
      await writeAdminAudit(admin, {
        adminUserId: adminId,
        adminEmail,
        action: 'user_delete_failed',
        targetUserId: targetId,
        targetEmail,
        metadata: { stage: 'auth_delete', message: delErr.message, archived, storage_removed: storageRemoved },
      });
      return json({ error: 'delete_failed' }, 500);
    }

    // 7c. Tables that reference the user WITHOUT a cascading FK (collections, discounts, template_blocks,
    // reviews, push_tokens). Done after the auth user is gone so a failed delete never half-wipes a live account.
    const cleanup = await cleanupNonCascadingTables(admin, targetId);
    storageErrors.push(...cleanup.errors);

    // 8. Verify + final audit
    const { data: rowsAfter } = await admin.rpc('count_user_rows', { p_user_id: targetId });
    const leftover = rowsAfter && typeof rowsAfter === 'object' ? rowsAfter : {};
    const auditOk = await writeAdminAudit(admin, {
      adminUserId: adminId,
      adminEmail,
      action: 'user_deleted',
      targetUserId: targetId,
      targetEmail,
      metadata: {
        store_name: profile?.store_name ?? null,
        archived,
        storage_removed: storageRemoved,
        storage_errors: storageErrors,
        non_cascading_rows_deleted: cleanup.deleted,
        rows_before: rowsBefore ?? {},
        rows_left_behind: leftover,
      },
    });

    return json({
      ok: true,
      deleted_user_id: targetId,
      archived,
      storage_removed: storageRemoved,
      storage_errors: storageErrors,
      non_cascading_rows_deleted: cleanup.deleted,
      rows_left_behind: leftover,
      audit_recorded: auditOk,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('admin-delete-user failed', { message });
    return json({ error: 'server_error' }, 500);
  }
});
