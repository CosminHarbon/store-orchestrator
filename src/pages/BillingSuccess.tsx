import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { resolveEntitledPostLoginPath } from '@/hooks/useEntitlementGate';
import { supabase } from '@/integrations/supabase/client';

type Phase = 'checking' | 'activating' | 'ready' | 'timeout' | 'error';

/**
 * After Stripe Checkout — never trusts session_id alone.
 * Polls our entitlement status until access is active or timeout.
 */
const BillingSuccess = () => {
  const { user, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('checking');
  const attempts = useRef(0);
  const sessionId = params.get('session_id');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }

    let cancelled = false;
    const maxAttempts = 20;

    const tick = async () => {
      attempts.current += 1;
      setPhase(attempts.current <= 2 ? 'checking' : 'activating');

      try {
        const { data, error } = await supabase.functions.invoke('billing-entitlement-status', {
          body: {},
        });
        if (cancelled) return;

        if (error) {
          const { data: rpc } = await supabase.rpc('get_my_entitlement_status');
          if (rpc?.has_entitlement) {
            setPhase('ready');
            const path = await resolveEntitledPostLoginPath();
            navigate(path, { replace: true });
            return;
          }
        } else if (
          data?.has_entitlement ||
          (data?.enforcement_active && data?.has_access && !data?.trial?.is_trial_active)
        ) {
          setPhase('ready');
          const path = await resolveEntitledPostLoginPath();
          navigate(path, { replace: true });
          return;
        }

        if (attempts.current >= maxAttempts) {
          setPhase('timeout');
          return;
        }

        window.setTimeout(() => {
          void tick();
        }, 1500);
      } catch {
        if (cancelled) return;
        if (attempts.current >= maxAttempts) {
          setPhase('error');
          return;
        }
        window.setTimeout(() => {
          void tick();
        }, 2000);
      }
    };

    void tick();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, navigate, sessionId]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-gradient-to-b from-background to-muted/30 px-4">
      <BrandLogo className="h-8" />
      <div className="w-full max-w-md space-y-4 text-center">
        {(phase === 'checking' || phase === 'activating' || phase === 'ready') && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              Activating your SpeedVendors account…
            </h1>
            <p className="text-sm text-muted-foreground">
              We’re confirming your subscription. This usually takes a few seconds.
            </p>
          </>
        )}
        {phase === 'timeout' && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Still activating</h1>
            <p className="text-sm text-muted-foreground">
              Payment may have succeeded, but access isn’t active yet. You can retry, or open
              billing settings after a minute.
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => window.location.reload()}>Retry</Button>
              <Button variant="outline" asChild>
                <Link to="/subscribe">Back to plans</Link>
              </Button>
            </div>
          </>
        )}
        {phase === 'error' && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              We couldn’t confirm your subscription status. Please try again.
            </p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </>
        )}
      </div>
    </div>
  );
};

export default BillingSuccess;
