import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonation } from '@/hooks/useImpersonation';

/** Shape returned by public.get_my_trial_status() / the `trial` key of get_my_entitlement_status(). */
export type TrialStatus = {
  has_trial: boolean;
  subscription_status: 'trialing' | 'trial_expired' | 'active' | 'past_due' | 'cancelled' | null;
  is_trial_active?: boolean;
  trial_started_at?: string;
  trial_ends_at?: string;
  seconds_remaining?: number;
  days_remaining?: number;
  server_now?: string;
};

/**
 * Visibility ladder. The server decides whether a trial is active; this only decides how loudly
 * to say so. `calm` = only shown in Settings → Billing.
 */
export type TrialLevel = 'none' | 'calm' | 'notice' | 'warning' | 'urgent' | 'expired';

export type TrialView = {
  loading: boolean;
  status: TrialStatus | null;
  level: TrialLevel;
  daysLeft: number;
  hoursLeft: number;
  endsAt: Date | null;
  /** Trial-tracked user whose access has lapsed: read-only, writes are refused by the server. */
  locked: boolean;
};

const HOUR = 3600;
const DAY = 24 * HOUR;

export function levelForSeconds(secondsLeft: number): TrialLevel {
  if (secondsLeft <= 0) return 'expired';
  if (secondsLeft <= DAY) return 'urgent';
  if (secondsLeft <= 2 * DAY) return 'warning';
  if (secondsLeft <= 3 * DAY) return 'notice';
  return 'calm';
}

export function useTrialStatus(): TrialView {
  const { user } = useAuth();
  const { isImpersonating } = useImpersonation();
  const queryClient = useQueryClient();
  const enabled = !!user && !isImpersonating;

  const query = useQuery({
    queryKey: ['trial-status', user?.id],
    enabled,
    staleTime: 60_000,
    // Always re-check on mount so landing back from checkout / redeeming a code drops the
    // trial/locked banner immediately instead of after the stale window.
    refetchOnMount: 'always',
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<TrialStatus> => {
      const { data, error } = await supabase.rpc('get_my_trial_status');
      if (error) throw error;
      return data as TrialStatus;
    },
  });

  // Countdown ticks locally from the SERVER-reported remaining seconds (only elapsed time is
  // taken from the client clock, so clock skew cannot extend or shorten a trial).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!query.data?.is_trial_active) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [query.data?.is_trial_active]);

  const data = query.data ?? null;
  const fetchedAt = query.dataUpdatedAt;

  const secondsLeft = useMemo(() => {
    if (!data?.has_trial || typeof data.seconds_remaining !== 'number') return null;
    if (!data.is_trial_active) return 0;
    const elapsed = Math.max(0, Math.floor((Date.now() - fetchedAt) / 1000));
    return Math.max(0, data.seconds_remaining - elapsed);
    // `tick` deliberately re-evaluates the countdown every 30s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, fetchedAt, tick]);

  // The moment the local countdown hits zero, ask the server for the authoritative state.
  useEffect(() => {
    if (secondsLeft === 0 && data?.is_trial_active) {
      void queryClient.invalidateQueries({ queryKey: ['trial-status'] });
      void queryClient.invalidateQueries({ queryKey: ['entitlement-status'] });
    }
  }, [secondsLeft, data?.is_trial_active, queryClient]);

  return useMemo<TrialView>(() => {
    const status = data;
    if (!status?.has_trial) {
      return { loading: query.isLoading && enabled, status, level: 'none', daysLeft: 0, hoursLeft: 0, endsAt: null, locked: false };
    }
    const endsAt = status.trial_ends_at ? new Date(status.trial_ends_at) : null;
    const s = secondsLeft ?? 0;

    if (status.subscription_status === 'trialing') {
      return {
        loading: false,
        status,
        level: levelForSeconds(s),
        daysLeft: Math.max(0, Math.ceil(s / DAY)),
        hoursLeft: Math.max(0, Math.ceil(s / HOUR)),
        endsAt,
        locked: false,
      };
    }
    if (status.subscription_status === 'trial_expired') {
      return { loading: false, status, level: 'expired', daysLeft: 0, hoursLeft: 0, endsAt, locked: true };
    }
    // active / past_due / cancelled: converted users see billing, not the trial UI.
    return { loading: false, status, level: 'none', daysLeft: 0, hoursLeft: 0, endsAt, locked: status.subscription_status === 'cancelled' };
  }, [data, secondsLeft, query.isLoading, enabled]);
}
