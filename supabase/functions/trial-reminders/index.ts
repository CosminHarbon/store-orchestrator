import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import {
  authenticateSuperadmin,
  isServiceRoleRequest,
  writeAdminAudit,
} from '../_shared/adminAuth.ts';
import { billingCorsHeaders } from '../_shared/billingStripe.ts';
import { deliverTrialReminder, type TrialMilestone } from '../_shared/trialReminders.ts';

/**
 * Trial reminders.
 *
 *  1. Cron (service-role bearer, e.g. hourly pg_cron / Supabase scheduled function):
 *       POST {}                      → claim + deliver every due milestone.
 *     Duplicate protection lives in the database: claim_due_trial_reminders() inserts the
 *     (user, milestone, trial_ends_at) row under a unique index, so overlapping or restarted
 *     runs can never claim the same reminder twice. Delivery is at-most-once by design.
 *
 *  2. Superadmin (JWT, role + AAL2 verified by Postgres):
 *       POST { action: "send_manual", user_id }
 *     Sends the milestone that matches the user's current state and audits it. Manual sends
 *     never consume the automatic milestone.
 */

const cors = billingCorsHeaders();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function manualMilestone(secondsRemaining: number): { milestone: TrialMilestone; days: number } {
  if (secondsRemaining <= 0) return { milestone: 'expired', days: 0 };
  if (secondsRemaining <= 24 * 3600) return { milestone: 'final', days: 1 };
  if (secondsRemaining <= 48 * 3600) return { milestone: '1d', days: 2 };
  return { milestone: '3d', days: Math.ceil(secondsRemaining / 86400) };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const body = await req.json().catch(() => ({}));

    // ---- Cron path -------------------------------------------------------------------
    if (isServiceRoleRequest(req)) {
      const admin = createClient(supabaseUrl, service);
      const { data: claimed, error } = await admin.rpc('claim_due_trial_reminders', { p_limit: 500 });
      if (error) {
        console.error('claim_due_trial_reminders failed', { message: error.message });
        return json({ error: 'claim_failed' }, 500);
      }

      const rows = (claimed ?? []) as Array<{
        reminder_id: string;
        target_user_id: string;
        milestone_key: TrialMilestone;
        ends_at: string;
      }>;

      const summary = { claimed: rows.length, sent: 0, partial: 0, failed: 0 };
      for (const row of rows) {
        const outcome = await deliverTrialReminder(admin, {
          userId: row.target_user_id,
          milestone: row.milestone_key,
          daysRemaining: row.milestone_key === '3d' ? 3 : undefined,
          source: 'cron',
        });
        summary[outcome.status] += 1;
        const { error: completeErr } = await admin.rpc('complete_trial_reminder', {
          p_reminder_id: row.reminder_id,
          p_status: outcome.status,
          p_channels: outcome.channels,
        });
        if (completeErr) {
          console.error('complete_trial_reminder failed', { message: completeErr.message });
        }
      }
      return json({ ok: true, ...summary });
    }

    // ---- Superadmin manual path -----------------------------------------------------
    const auth = await authenticateSuperadmin(req);
    if (!auth.ok) return json({ error: auth.failure.error }, auth.failure.status);
    const { admin, userId: adminId, email: adminEmail } = auth.value;

    if (body?.action !== 'send_manual') return json({ error: 'unknown_action' }, 400);
    const targetId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    if (!/^[0-9a-f-]{36}$/i.test(targetId)) return json({ error: 'invalid_user_id' }, 400);

    const { data: trial, error: trialErr } = await admin
      .from('user_trials')
      .select('user_id, trial_ends_at, subscription_status')
      .eq('user_id', targetId)
      .maybeSingle();
    if (trialErr) return json({ error: 'lookup_failed' }, 500);
    if (!trial) return json({ error: 'no_trial' }, 404);

    // Refresh so a just-expired or just-converted user is judged on current state.
    await admin.rpc('refresh_user_trial_status', { p_user_id: targetId });
    const { data: fresh } = await admin
      .from('user_trials')
      .select('trial_ends_at, subscription_status')
      .eq('user_id', targetId)
      .single();
    if (!fresh || !['trialing', 'trial_expired'].includes(fresh.subscription_status)) {
      return json({ error: 'not_in_trial', status: fresh?.subscription_status ?? null }, 409);
    }

    const secondsRemaining = Math.floor((new Date(fresh.trial_ends_at).getTime() - Date.now()) / 1000);
    const { milestone, days } = manualMilestone(secondsRemaining);

    const { data: target } = await admin.auth.admin.getUserById(targetId);
    const targetEmail = target?.user?.email ?? null;

    const { data: inserted, error: insErr } = await admin
      .from('trial_reminders')
      .insert({
        user_id: targetId,
        milestone,
        trial_ends_at: fresh.trial_ends_at,
        trigger_source: 'manual',
        sent_by: adminId,
      })
      .select('id')
      .single();
    if (insErr || !inserted) {
      console.error('manual reminder insert failed', { message: insErr?.message });
      return json({ error: 'record_failed' }, 500);
    }

    const outcome = await deliverTrialReminder(admin, {
      userId: targetId,
      milestone,
      daysRemaining: days,
      source: 'manual',
    });
    await admin.rpc('complete_trial_reminder', {
      p_reminder_id: inserted.id,
      p_status: outcome.status,
      p_channels: outcome.channels,
    });

    await writeAdminAudit(admin, {
      adminUserId: adminId,
      adminEmail,
      action: 'trial_reminder_sent_manually',
      targetUserId: targetId,
      targetEmail,
      metadata: { milestone, channels: outcome.channels, status: outcome.status },
    });

    return json({ ok: true, milestone, status: outcome.status, channels: outcome.channels });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('trial-reminders failed', { message });
    return json({ error: 'server_error' }, 500);
  }
});
