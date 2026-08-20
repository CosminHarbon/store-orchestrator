import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'sv_impersonate_user_id';
const LABEL_KEY = 'sv_impersonate_label';

type ImpersonationContextValue = {
  impersonatedUserId: string | null;
  impersonatedLabel: string | null;
  isImpersonating: boolean;
  /** Merchant tenant to operate on (impersonated store, or self). */
  effectiveUserId: string | null;
  startImpersonation: (userId: string, label?: string) => void;
  stopImpersonation: () => void;
};

const ImpersonationContext = createContext<ImpersonationContextValue | undefined>(undefined);

function readStored(): { userId: string | null; label: string | null } {
  if (typeof window === 'undefined') return { userId: null, label: null };
  return {
    userId: sessionStorage.getItem(STORAGE_KEY),
    label: sessionStorage.getItem(LABEL_KEY),
  };
}

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [{ userId: impersonatedUserId, label: impersonatedLabel }, setState] = useState(readStored);

  useEffect(() => {
    // Drop stale impersonation when the real session ends
    if (!user && impersonatedUserId) {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(LABEL_KEY);
      setState({ userId: null, label: null });
    }
  }, [user, impersonatedUserId]);

  const startImpersonation = useCallback(
    (targetUserId: string, label?: string) => {
      sessionStorage.setItem(STORAGE_KEY, targetUserId);
      if (label) sessionStorage.setItem(LABEL_KEY, label);
      else sessionStorage.removeItem(LABEL_KEY);
      setState({ userId: targetUserId, label: label || null });
      void queryClient.clear();
    },
    [queryClient]
  );

  const stopImpersonation = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(LABEL_KEY);
    setState({ userId: null, label: null });
    void queryClient.clear();
  }, [queryClient]);

  const value = useMemo<ImpersonationContextValue>(
    () => ({
      impersonatedUserId,
      impersonatedLabel,
      isImpersonating: !!impersonatedUserId,
      effectiveUserId: impersonatedUserId || user?.id || null,
      startImpersonation,
      stopImpersonation,
    }),
    [impersonatedUserId, impersonatedLabel, user?.id, startImpersonation, stopImpersonation]
  );

  return (
    <ImpersonationContext.Provider value={value}>{children}</ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) {
    throw new Error('useImpersonation must be used within ImpersonationProvider');
  }
  return ctx;
}

/** Safe for code that may run outside the provider (returns nulls). */
export function useOptionalImpersonation() {
  return useContext(ImpersonationContext);
}

/**
 * Resolve the merchant tenant id for non-React / async write paths.
 * Prefer impersonation sessionStorage, else the signed-in auth user.
 */
export async function resolveTenantUserId(
  getUserId?: () => Promise<string | null | undefined>
): Promise<string | null> {
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  }
  if (getUserId) {
    return (await getUserId()) || null;
  }
  return null;
}

export function getStoredImpersonationUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(STORAGE_KEY);
}
