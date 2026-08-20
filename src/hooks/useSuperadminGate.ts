import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type SuperadminGate =
  | { status: 'loading' }
  | { status: 'not_superadmin' }
  | { status: 'needs_enroll' }
  | { status: 'needs_challenge' }
  | { status: 'ready' };

/**
 * Resolves whether the signed-in user is a platform superadmin and whether
 * MFA (AAL2) is satisfied. Merchants always get `not_superadmin`.
 */
export function useSuperadminGate() {
  const { user, session, loading: authLoading } = useAuth();
  const [gate, setGate] = useState<SuperadminGate>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (authLoading) {
      setGate({ status: 'loading' });
      return;
    }
    if (!user || !session) {
      setGate({ status: 'not_superadmin' });
      return;
    }

    const { data: isSuper, error } = await supabase.rpc('is_superadmin_user');
    if (error || !isSuper) {
      setGate({ status: 'not_superadmin' });
      return;
    }

    const { data: aal, error: aalError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) {
      setGate({ status: 'needs_enroll' });
      return;
    }

    if (aal.currentLevel === 'aal2') {
      setGate({ status: 'ready' });
      return;
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.filter((f) => f.status === 'verified') ?? [];
    if (verified.length === 0) {
      setGate({ status: 'needs_enroll' });
      return;
    }

    setGate({ status: 'needs_challenge' });
  }, [user, session, authLoading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { gate, refresh };
}

export async function resolvePostLoginPath(): Promise<string> {
  const { data: isSuper } = await supabase.rpc('is_superadmin_user');
  if (!isSuper) return '/app';

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2') return '/admin';

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.filter((f) => f.status === 'verified') ?? [];
  if (verified.length === 0) return '/admin/mfa?mode=enroll';
  return '/admin/mfa?mode=challenge';
}
