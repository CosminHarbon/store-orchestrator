import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useImpersonation } from '@/hooks/useImpersonation';
import type { TrialStatus } from '@/hooks/useTrialStatus';

export type EntitlementStatus = {
  has_access: boolean;
  has_entitlement: boolean;
  enforcement_enabled: boolean;
  enforcement_active?: boolean;
  is_superadmin: boolean;
  email_verified?: boolean;
  env_allows?: boolean;
  active_sources?: string[];
  billing_warning?: string | null;
  grace_until?: string | null;
  /** Server-derived: trialing | trial_expired | active | past_due | cancelled | null (legacy). */
  subscription_status?: string | null;
  trial?: TrialStatus | null;
  subscription?: {
    status: string;
    plan: string | null;
    tier?: string | null;
    billing_interval: string | null;
    stripe_price_id?: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    grace_until: string | null;
    pending_tier?: string | null;
    pending_interval?: string | null;
    pending_effective_at?: string | null;
  } | null;
};

type GateState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'ready'; entitlement: EntitlementStatus };

export function isEnforcementEffective(status: EntitlementStatus): boolean {
  if (typeof status.enforcement_active === 'boolean') return status.enforcement_active;
  return status.enforcement_enabled === true;
}

export function isEmailConfirmed(user: {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
} | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

async function loadMergedEntitlementStatus(): Promise<EntitlementStatus> {
  const { data, error } = await supabase.rpc('get_my_entitlement_status');
  const entitlement = (
    error || !data
      ? {
          has_access: true,
          has_entitlement: false,
          enforcement_enabled: false,
          is_superadmin: false,
        }
      : data
  ) as EntitlementStatus;

  if (error) {
    console.error('get_my_entitlement_status', error.message);
  }

  try {
    const { data: edge } = await supabase.functions.invoke('billing-entitlement-status', {
      body: {},
    });
    if (edge && typeof edge === 'object' && !('error' in edge && (edge as { error?: string }).error)) {
      // Preserve RPC trial-aware access: a stale Edge deploy must not wipe has_access for
      // an active application-level trial (or force paid-only semantics onto has_entitlement).
      const rpcAccess = entitlement.has_access;
      const rpcPaid = entitlement.has_entitlement;
      const rpcTrial = entitlement.trial;
      const rpcSubStatus = entitlement.subscription_status;
      Object.assign(entitlement, edge);
      if (rpcAccess === true) entitlement.has_access = true;
      if (typeof rpcPaid === 'boolean') entitlement.has_entitlement = rpcPaid;
      if (rpcTrial && !entitlement.trial) entitlement.trial = rpcTrial;
      if (rpcSubStatus && entitlement.subscription_status == null) {
        entitlement.subscription_status = rpcSubStatus;
      }
    }
  } catch {
    /* RPC is enough when Edge is unavailable */
  }

  return entitlement;
}

/**
 * Reads entitlement from RPC + Edge (effective enforcement = DB ∧ env allows).
 * While enforcement is off, has_access is always true for authenticated users.
 */
export function useEntitlementGate() {
  const { user, loading: authLoading } = useAuth();
  const [gate, setGate] = useState<GateState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (authLoading) {
      setGate({ status: 'loading' });
      return;
    }
    if (!user) {
      setGate({ status: 'anonymous' });
      return;
    }

    const entitlement = await loadMergedEntitlementStatus();
    setGate({ status: 'ready', entitlement });
  }, [user, authLoading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { gate, refresh };
}

/**
 * Application access is decided by the server (`has_access`): superadmin, paid entitlement, an
 * explicitly-started active trial, or a legacy account. A new account that has not chosen a plan, and
 * an expired trial, have has_access = false and are sent to the plan-selection screen.
 * (Access and onboarding completion are separate: this never decides whether setup is skipped.)
 */
function merchantAccessBlocked(entitlement: EntitlementStatus): boolean {
  if (entitlement.is_superadmin) return false;
  return entitlement.has_access === false;
}

/**
 * Redirects users without application access to /subscribe (plan selection).
 * Superadmin and impersonation are left to the host page.
 * Callers MUST NOT send the user to /setup until `ready && !blocked`.
 */
export function useMerchantAccessGate() {
  const { user, loading } = useAuth();
  const { isImpersonating } = useImpersonation();
  const { gate, refresh } = useEntitlementGate();
  const navigate = useNavigate();

  const ready = !loading && !!user && gate.status === 'ready';
  const blocked =
    ready && !isImpersonating && merchantAccessBlocked(gate.entitlement);

  useEffect(() => {
    if (loading || !user) return;
    if (isImpersonating) return;
    if (gate.status !== 'ready') return;
    const entitlement = gate.entitlement;
    if (entitlement.is_superadmin) return;
    if (!isEmailConfirmed(user)) {
      navigate('/auth?verify=1', { replace: true });
      return;
    }
    if (merchantAccessBlocked(entitlement)) {
      navigate('/subscribe', { replace: true });
    }
  }, [user, loading, isImpersonating, gate, navigate]);

  return { gate, refresh, ready, blocked };
}

/**
 * Post-login destination that respects entitlement when enforcement is active.
 * Native apps never go to /subscribe purchase UI in this phase — they stay gated
 * on /subscribe with a "use the website" message (no Checkout / access codes).
 */
export async function resolveEntitledPostLoginPath(): Promise<string> {
  const { data: isSuper } = await supabase.rpc('is_superadmin_user');
  if (isSuper) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === 'aal2') return '/admin';
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.filter((f) => f.status === 'verified') ?? [];
    if (verified.length === 0) return '/admin/mfa?mode=enroll';
    return '/admin/mfa?mode=challenge';
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !isEmailConfirmed(user)) {
    return '/auth?verify=1';
  }

  const status = await loadMergedEntitlementStatus();

  if (!status.is_superadmin && status.has_access === false) {
    return '/subscribe';
  }

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('setup_completed, welcome_dismissed')
      .eq('user_id', user.id)
      .maybeSingle();
    if (
      profile &&
      profile.setup_completed !== true &&
      profile.welcome_dismissed !== true
    ) {
      return '/setup';
    }
  }

  return '/app';
}

export function isNativeBillingPurchaseBlocked(): boolean {
  return Capacitor.isNativePlatform();
}
