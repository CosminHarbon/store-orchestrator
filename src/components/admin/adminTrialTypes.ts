export type TrialSubscriptionStatus =
  | 'trialing'
  | 'trial_expired'
  | 'active'
  | 'past_due'
  | 'cancelled';

/** Row of public.admin_list_trials(). */
export type AdminTrialRow = {
  user_id: string;
  email: string | null;
  user_name: string | null;
  merchant_id: string | null;
  store_name: string | null;
  signed_up_at: string;
  trial_started_at: string;
  trial_ends_at: string;
  days_remaining: number;
  subscription_status: TrialSubscriptionStatus;
  current_plan: string | null;
  last_sign_in_at: string | null;
  total_count: number;
};

/** Result of public.admin_trial_summary(). */
export type AdminTrialSummary = {
  active_trials: number;
  expiring_24h: number;
  expired_trials: number;
  converted_to_paid: number;
  concluded_trials: number;
  conversion_rate: number | null;
};

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export const STATUS_LABEL: Record<TrialSubscriptionStatus, string> = {
  trialing: 'Trialing',
  trial_expired: 'Trial expired',
  active: 'Active',
  past_due: 'Past due',
  cancelled: 'Cancelled',
};

export const STATUS_BADGE: Record<
  TrialSubscriptionStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  trialing: 'secondary',
  trial_expired: 'destructive',
  active: 'default',
  past_due: 'destructive',
  cancelled: 'outline',
};
