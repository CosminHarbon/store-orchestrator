import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type EntitlementStatus = {
  has_access: boolean;
  has_entitlement: boolean;
  enforcement_enabled: boolean;
  enforcement_active?: boolean;
  is_superadmin: boolean;
  email_verified?: boolean;
  active_sources?: string[];
  billing_warning?: string | null;
  grace_until?: string | null;
  subscription?: {
    status: string;
    plan: string | null;
    billing_interval: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    grace_until: string | null;
  } | null;
};

type GateState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'ready'; entitlement: EntitlementStatus };

/**
 * Reads entitlement from RPC + optional Edge status.
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

    const { data, error } = await supabase.rpc('get_my_entitlement_status');
    if (error) {
      console.error('get_my_entitlement_status', error.message);
      // Fail open only when we cannot read status AND assume enforcement off —
      // still prefer a safe default of allowing access until enforcement is on.
      setGate({
        status: 'ready',
        entitlement: {
          has_access: true,
          has_entitlement: false,
          enforcement_enabled: false,
          is_superadmin: false,
        },
      });
      return;
    }

    const entitlement = (data || {}) as EntitlementStatus;

    // Prefer Edge view when available (combines env ∧ DB enforcement).
    try {
      const { data: edge } = await supabase.functions.invoke('billing-entitlement-status', {
        body: {},
      });
      if (edge && typeof edge === 'object' && !('error' in edge && edge.error)) {
        Object.assign(entitlement, edge);
      }
    } catch {
      // Edge may not be deployed yet — RPC is enough.
    }

    setGate({ status: 'ready', entitlement });
  }, [user, authLoading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { gate, refresh };
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

  const { data } = await supabase.rpc('get_my_entitlement_status');
  const status = (data || {}) as EntitlementStatus;

  // Enforcement off → existing merchant app.
  if (!status.enforcement_enabled) {
    return '/app';
  }

  if (status.has_access) {
    return '/app';
  }

  return '/subscribe';
}

export function isNativeBillingPurchaseBlocked(): boolean {
  return Capacitor.isNativePlatform();
}
