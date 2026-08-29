import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import {
  isNativeBillingPurchaseBlocked,
  resolveEntitledPostLoginPath,
  useEntitlementGate,
} from '@/hooks/useEntitlementGate';
import { payloadFromFunctionsInvoke } from '@/lib/edgeFunctionPayload';
import { MARKETING_PRICING, hasPrice } from '@/lib/marketingPricing';
import { supabase } from '@/integrations/supabase/client';

type Plan = 'monthly' | 'yearly';

/**
 * Subscription gate page. Web: Stripe Checkout + access codes.
 * Native: entitlement-aware message only (no Checkout / codes in this phase).
 */
const Subscribe = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { gate, refresh } = useEntitlementGate();
  const [busy, setBusy] = useState<Plan | 'code' | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const nativeBlocked = isNativeBillingPurchaseBlocked();
  const alreadyEntitled =
    gate.status === 'ready' &&
    (gate.entitlement.has_entitlement || gate.entitlement.is_superadmin);
  const checkoutLocked = busy !== null || authLoading || gate.status === 'loading' || alreadyEntitled;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (gate.status === 'ready' && (gate.entitlement.has_entitlement || gate.entitlement.is_superadmin)) {
      void resolveEntitledPostLoginPath().then((path) => {
        if (path !== '/subscribe') navigate(path, { replace: true });
      });
    }
  }, [user, authLoading, gate, navigate]);

  const startCheckout = async (plan: Plan) => {
    if (nativeBlocked) {
      toast.message('Subscribe on the web', {
        description: 'Open speedvendors.com in a browser to choose a plan.',
      });
      return;
    }
    if (alreadyEntitled) {
      toast.message('You already have a SpeedVendors subscription', {
        description: 'Manage your plan in Settings → Billing.',
      });
      try {
        localStorage.setItem('activeTab', 'settings');
      } catch {
        /* ignore */
      }
      navigate('/app', { replace: true });
      return;
    }
    setBusy(plan);
    try {
      const { data, error } = await supabase.functions.invoke('billing-create-checkout-session', {
        body: { plan },
      });
      const payload = await payloadFromFunctionsInvoke(data, error);
      const code = typeof payload.error === 'string' ? payload.error : '';
      const url = typeof payload.url === 'string' ? payload.url : '';
      if (
        code === 'already_subscribed' ||
        code === 'subscription_canceling' ||
        code === 'subscription_incomplete'
      ) {
        const description =
          code === 'subscription_canceling'
            ? 'Your current plan stays active until the period ends. Manage it in Settings → Billing.'
            : code === 'subscription_incomplete'
              ? 'Finish or manage your existing subscription in Settings → Billing.'
              : 'Manage your plan in Settings → Billing.';
        toast.message('You already have a SpeedVendors subscription', { description });
        try {
          localStorage.setItem('activeTab', 'settings');
        } catch {
          /* ignore */
        }
        navigate('/app', { replace: true });
        return;
      }
      if (code === 'billing_not_configured') {
        toast.error('Billing is not configured yet. Please try again later.');
        return;
      }
      if (code === 'email_not_verified') {
        toast.error('Please verify your email before subscribing.');
        return;
      }
      if (error && !url) throw error;
      if (!url) {
        toast.error('Could not start checkout.');
        return;
      }
      window.location.assign(url);
    } catch (e) {
      console.error(e);
      toast.error('Could not start checkout.');
    } finally {
      setBusy(null);
    }
  };

  const redeemCode = async () => {
    if (nativeBlocked) {
      toast.message('Use the website', {
        description: 'Access codes can be redeemed on speedvendors.com.',
      });
      return;
    }
    const code = accessCode.trim();
    if (!code) return;
    setBusy('code');
    try {
      const { data, error } = await supabase.functions.invoke('billing-redeem-access-code', {
        body: { code },
      });
      const payload = await payloadFromFunctionsInvoke(data, error);
      const payloadError = typeof payload.error === 'string' ? payload.error : '';
      if (payloadError === 'already_redeemed') {
        toast.error('This access code was already used on this account.');
        return;
      }
      if (payloadError === 'invalid_or_exhausted_code' || payloadError === 'invalid_code') {
        toast.error('That access code is not valid.');
        return;
      }
      if (payloadError) {
        toast.error('Could not apply access code.');
        return;
      }
      if (error) throw error;
      toast.success('Access granted');
      await refresh();
      const path = await resolveEntitledPostLoginPath();
      navigate(path, { replace: true });
    } catch (e) {
      console.error(e);
      toast.error('Could not apply access code.');
    } finally {
      setBusy(null);
    }
  };

  const monthlyLabel = hasPrice(MARKETING_PRICING.monthly)
    ? MARKETING_PRICING.monthly
    : 'Price coming soon';
  const yearlyLabel = hasPrice(MARKETING_PRICING.yearly)
    ? MARKETING_PRICING.yearly
    : 'Price coming soon';

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-muted/40">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <BrandLogo className="h-8" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pb-16 pt-6 sm:px-8">
        <div className="space-y-3 text-center">
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Choose your plan</h1>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Subscribe to unlock SpeedVendors for your store. Cancel anytime from billing settings.
          </p>
        </div>

        {nativeBlocked ? (
          <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Subscriptions are managed on the web. Sign in at{' '}
              <a
                className="underline underline-offset-2"
                href="https://www.speedvendors.com/subscribe"
                target="_blank"
                rel="noreferrer"
              >
                speedvendors.com/subscribe
              </a>
              , then return to this app.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                disabled={checkoutLocked}
                onClick={() => void startCheckout('monthly')}
                className="rounded-2xl border border-border/70 bg-card p-6 text-left transition hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <div className="text-sm font-medium text-muted-foreground">Monthly</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight">{monthlyLabel}</div>
                <p className="mt-2 text-sm text-muted-foreground">Billed monthly.</p>
                <div className="mt-6">
                  <span className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                    {busy === 'monthly' ? 'Redirecting…' : 'Continue'}
                  </span>
                </div>
              </button>

              <button
                type="button"
                disabled={checkoutLocked}
                onClick={() => void startCheckout('yearly')}
                className="rounded-2xl border border-border/70 bg-card p-6 text-left transition hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <div className="text-sm font-medium text-muted-foreground">Yearly</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight">{yearlyLabel}</div>
                <p className="mt-2 text-sm text-muted-foreground">Billed yearly.</p>
                <div className="mt-6">
                  <span className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                    {busy === 'yearly' ? 'Redirecting…' : 'Continue'}
                  </span>
                </div>
              </button>
            </div>

            <div className="mx-auto w-full max-w-md space-y-3 border-t border-border/50 pt-8">
              <p className="text-center text-sm text-muted-foreground">Have an access code?</p>
              <div className="flex gap-2">
                <Input
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Enter access code"
                  autoComplete="off"
                  className="font-mono"
                />
                <Button
                  variant="secondary"
                  disabled={checkoutLocked || !accessCode.trim()}
                  onClick={() => void redeemCode()}
                >
                  {busy === 'code' ? 'Applying…' : 'Apply'}
                </Button>
              </div>
            </div>
          </>
        )}

        {!Capacitor.isNativePlatform() && (
          <p className="text-center text-xs text-muted-foreground">
            Already subscribed?{' '}
            <Link to="/billing/success" className="underline underline-offset-2">
              Check activation status
            </Link>
          </p>
        )}
      </main>
    </div>
  );
};

export default Subscribe;
