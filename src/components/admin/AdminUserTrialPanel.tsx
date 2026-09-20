import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { payloadFromFunctionsInvoke } from '@/lib/edgeFunctionPayload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import {
  STATUS_BADGE,
  STATUS_LABEL,
  fmtDate,
  fmtDateTime,
  type TrialSubscriptionStatus,
} from './adminTrialTypes';

type Overview = {
  account: {
    user_id: string;
    email: string | null;
    name: string | null;
    created_at: string;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
    is_superadmin: boolean;
  };
  merchant: { merchant_id: string | null; store_name: string | null; setup_completed: boolean | null };
  trial: {
    has_trial: boolean;
    subscription_status: TrialSubscriptionStatus | null;
    plan_state?: string;
    trial_state?: string;
    trial_started_at?: string;
    trial_ends_at?: string;
    days_remaining?: number;
    original_trial_ends_at?: string | null;
    extended_count?: number | null;
    converted_at?: string | null;
    source?: string | null;
  };
  subscription: {
    status: string;
    tier: string | null;
    plan: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
  has_access: boolean;
  reminders: Array<{
    milestone: string;
    trigger_source: string;
    status: string;
    channels: Record<string, string>;
    claimed_at: string;
  }>;
  audit: Array<{ action: string; admin_email: string | null; metadata: Record<string, unknown>; created_at: string }>;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-all">{children}</div>
    </div>
  );
}

/**
 * Account + trial management on the superadmin user detail page. All mutations go through
 * server-authorised paths: `admin_extend_trial` (RPC: superadmin + AAL2, audited in-transaction),
 * `trial-reminders` and `admin-delete-user` (Edge Functions).
 */
export function AdminUserTrialPanel({
  userId,
  currentAdminId,
  onDeleted,
}: {
  userId: string;
  currentAdminId: string | undefined;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [customDate, setCustomDate] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const overview = useQuery({
    queryKey: ['admin-user-overview', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_user_overview', { p_user_id: userId });
      if (error) throw error;
      return data as Overview;
    },
  });

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-user-overview', userId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-trials'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-trial-summary'] }),
    ]);
  };

  const extend = async (args: { days?: number; endIso?: string }, label: string) => {
    setBusy(label);
    try {
      const { error } = await supabase.rpc('admin_extend_trial', {
        p_user_id: userId,
        p_days: args.days ?? null,
        p_new_end: args.endIso ?? null,
        p_reason: null,
      });
      if (error) throw error;
      toast.success(`Trial extended (${label}).`);
      setCustomDate('');
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not extend trial.');
    } finally {
      setBusy(null);
    }
  };

  const sendReminder = async () => {
    setBusy('reminder');
    try {
      const { data, error } = await supabase.functions.invoke('trial-reminders', {
        body: { action: 'send_manual', user_id: userId },
      });
      const payload = await payloadFromFunctionsInvoke(data, error);
      if (typeof payload.error === 'string') {
        throw new Error(
          payload.error === 'not_in_trial'
            ? 'This user is not in a trial (already subscribed or no trial).'
            : payload.error === 'no_trial'
              ? 'This user has no trial.'
              : `Reminder failed (${payload.error}).`,
        );
      }
      if (error && payload.ok !== true) throw new Error('Reminder failed.');
      const channels = (payload.channels ?? {}) as Record<string, string>;
      toast.success(
        `Reminder recorded — ${Object.entries(channels)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')}`,
      );
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reminder failed.');
    } finally {
      setBusy(null);
    }
  };

  const o = overview.data;
  const status = o?.trial.subscription_status ?? null;
  const isSelf = currentAdminId === userId;
  const canDelete = !!o && !o.account.is_superadmin && !isSelf && !!o.account.email;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Account &amp; trial
          {status ? <Badge variant={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge> : null}
        </CardTitle>
        <CardDescription>Server-authoritative status. Every action below is re-authorised on the server and audited.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {overview.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {overview.isError ? (
          <p className="text-sm text-destructive">{(overview.error as Error).message}</p>
        ) : null}

        {o ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Row label="Email">{o.account.email || '—'}</Row>
              <Row label="Name">{o.account.name || '—'}</Row>
              <Row label="User ID">{o.account.user_id}</Row>
              <Row label="Merchant ID">{o.merchant.merchant_id || '—'}</Row>
              <Row label="Store">{o.merchant.store_name || '—'}</Row>
              <Row label="Signed up">{fmtDateTime(o.account.created_at)}</Row>
              <Row label="Last login">{fmtDateTime(o.account.last_sign_in_at)}</Row>
              <Row label="Has app access">{o.has_access ? 'Yes' : 'No — locked'}</Row>
              <Row label="Plan state">{o.trial.plan_state || '—'}</Row>
              <Row label="Trial start">{o.trial.has_trial ? fmtDateTime(o.trial.trial_started_at) : 'Trial not started'}</Row>
              <Row label="Trial end">{o.trial.has_trial ? fmtDateTime(o.trial.trial_ends_at) : '—'}</Row>
              <Row label="Days remaining">
                {o.trial.has_trial && status === 'trialing' ? o.trial.days_remaining : '—'}
              </Row>
              <Row label="Extensions">{o.trial.extended_count ?? 0}</Row>
              <Row label="Plan">
                {o.subscription
                  ? `${o.subscription.tier || '—'} (${o.subscription.plan || '—'}) · ${o.subscription.status}`
                  : '—'}
              </Row>
              <Row label="Converted at">{fmtDate(o.trial.converted_at)}</Row>
            </div>

            <div className="space-y-2 border-t pt-4">
              <div className="text-sm font-medium">Trial actions</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={!!busy || o.account.is_superadmin} onClick={() => void extend({ days: 3 }, '+3 days')}>
                  +3 days
                </Button>
                <Button size="sm" variant="outline" disabled={!!busy || o.account.is_superadmin} onClick={() => void extend({ days: 7 }, '+7 days')}>
                  +7 days
                </Button>
                <Input
                  type="date"
                  value={customDate}
                  min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-44"
                  aria-label="Custom trial end date"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy || !customDate || o.account.is_superadmin}
                  onClick={() => void extend({ endIso: new Date(`${customDate}T23:59:59`).toISOString() }, `until ${customDate}`)}
                >
                  Set end date
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!!busy || !o.trial.has_trial || !['trialing', 'trial_expired'].includes(status ?? '')}
                  onClick={() => void sendReminder()}
                >
                  {busy === 'reminder' ? 'Sending…' : 'Send trial reminder'}
                </Button>
              </div>
              {!o.trial.has_trial ? (
                <p className="text-xs text-muted-foreground">
                  No trial started. Extending explicitly grants a trial starting now (audited).
                </p>
              ) : null}
            </div>

            {o.reminders.length > 0 ? (
              <div className="space-y-1 border-t pt-4">
                <div className="text-sm font-medium">Recent reminders</div>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {o.reminders.map((r) => (
                    <li key={`${r.claimed_at}-${r.milestone}-${r.trigger_source}`}>
                      {fmtDateTime(r.claimed_at)} · {r.milestone} · {r.trigger_source} · {r.status} ·{' '}
                      {Object.entries(r.channels || {})
                        .map(([k, v]) => `${k}=${v}`)
                        .join(' ')}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {o.audit.length > 0 ? (
              <div className="space-y-1 border-t pt-4">
                <div className="text-sm font-medium">Admin audit trail</div>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {o.audit.map((a) => (
                    <li key={`${a.created_at}-${a.action}`}>
                      {fmtDateTime(a.created_at)} · {a.action} · by {a.admin_email || 'unknown'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-2 rounded-md border border-destructive/40 p-3">
              <div className="text-sm font-medium text-destructive">Danger zone</div>
              <p className="text-xs text-muted-foreground">
                {isSelf
                  ? 'You cannot delete your own account.'
                  : o.account.is_superadmin
                    ? 'Superadmin accounts cannot be deleted here.'
                    : 'Permanently delete this account and its merchant data. Requires a 3-step confirmation and a fresh authenticator code.'}
              </p>
              <Button size="sm" variant="destructive" disabled={!canDelete} onClick={() => setDeleteOpen(true)}>
                Delete account…
              </Button>
            </div>

            {canDelete && o.account.email ? (
              <DeleteAccountDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                userId={o.account.user_id}
                email={o.account.email}
                storeName={o.merchant.store_name}
                onDeleted={() => {
                  void queryClient.invalidateQueries({ queryKey: ['admin-merchants'] });
                  void queryClient.invalidateQueries({ queryKey: ['admin-trials'] });
                  void queryClient.invalidateQueries({ queryKey: ['admin-trial-summary'] });
                  onDeleted();
                }}
              />
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
