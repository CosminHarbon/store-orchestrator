import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
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
import { advertisedMonthlyEquivalent, advertisedPrice } from '@/lib/marketingPricing';
import { SPEEDVENDORS_PLANS, SPEEDVENDORS_TIERS, type BillingInterval, type SpeedVendorsTier } from '@/lib/plans/catalogue';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useTrialStatus } from '@/hooks/useTrialStatus';

/**
 * Subscription gate page. Web: Stripe Checkout + access codes.
 * Native: entitlement-aware message only (no Checkout / codes in this phase).
 */
const Subscribe = () => {
  const { t } = useTranslation('common');
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { gate, refresh } = useEntitlementGate();
  const trial = useTrialStatus();
  const queryClient = useQueryClient();
  const [trialBusy, setTrialBusy] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [busy, setBusy] = useState<SpeedVendorsTier | 'code' | null>(null);
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

  const startCheckout = async (tier: SpeedVendorsTier) => {
    if (nativeBlocked) {
      toast.message(t('subscribe.nativeCta'), {
        description: t('subscribe.nativeCtaDesc'),
      });
      return;
    }
    if (alreadyEntitled) {
      toast.message(t('subscribe.alreadyTitle'), {
        description: t('subscribe.alreadyDesc'),
      });
      try {
        localStorage.setItem('activeTab', 'settings');
      } catch {
        /* ignore */
      }
      navigate('/app', { replace: true });
      return;
    }
    setBusy(tier);
    try {
      const { data, error } = await supabase.functions.invoke('billing-create-checkout-session', {
        body: {
          tier,
          interval,
          client_surface: Capacitor.isNativePlatform() ? 'native' : 'web',
        },
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
            ? t('subscribe.cancelingDesc')
            : code === 'subscription_incomplete'
              ? t('subscribe.incompleteDesc')
              : t('subscribe.alreadyDesc');
        toast.message(t('subscribe.alreadyTitle'), { description });
        try {
          localStorage.setItem('activeTab', 'settings');
        } catch {
          /* ignore */
        }
        navigate('/app', { replace: true });
        return;
      }
      if (code === 'billing_not_configured') {
        toast.error(t('subscribe.notConfigured'));
        return;
      }
      if (code === 'email_not_verified') {
        toast.error(t('subscribe.emailUnverified'));
        return;
      }
      if (error && !url) throw error;
      if (!url) {
        toast.error(t('subscribe.checkoutFailed'));
        return;
      }
      window.location.assign(url);
    } catch (e) {
      console.error(e);
      toast.error(t('subscribe.checkoutFailed'));
    } finally {
      setBusy(null);
    }
  };

  /**
   * The ONLY place a self-service trial is started: the user pressed "Start Free Trial".
   * The server decides eligibility, start and end (server time); nothing is sent from here.
   */
  const startTrial = async () => {
    if (trialBusy || busy !== null) return;
    setTrialBusy(true);
    try {
      const { data, error } = await supabase.rpc('start_free_trial');
      if (error) throw error;
      const res = (data || {}) as { ok?: boolean; code?: string };
      if (res.ok || res.code === 'already_started') {
        if (res.ok) toast.success(t('subscribe.trialStarted'));
        await queryClient.invalidateQueries({ queryKey: ['trial-status'] });
        await queryClient.invalidateQueries({ queryKey: ['entitlement-status'] });
        await refresh();
        const path = await resolveEntitledPostLoginPath();
        navigate(path, { replace: true });
        return;
      }
      if (res.code === 'email_not_verified') toast.error(t('subscribe.trialErrEmail'));
      else if (res.code === 'not_eligible' || res.code === 'not_applicable') toast.error(t('subscribe.trialErrEligible'));
      else if (res.code === 'already_subscribed') toast.error(t('subscribe.trialErrSubscribed'));
      else toast.error(t('subscribe.trialErrGeneric'));
      await queryClient.invalidateQueries({ queryKey: ['trial-status'] });
    } catch (e) {
      console.error(e);
      toast.error(t('subscribe.trialErrGeneric'));
    } finally {
      setTrialBusy(false);
    }
  };

  const trialCard = trial.eligible ? (
    <div
      data-testid="free-trial-card"
      className="flex flex-col rounded-2xl border border-dashed border-primary/60 bg-primary/5 p-6 text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-muted-foreground">{t('subscribe.trialFeature')}</div>
        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{t('subscribe.trialTitle')}</div>
      <p className="mt-2 text-sm text-muted-foreground">{t('subscribe.trialDesc')}</p>
      <div className="mt-6 pt-2">
        <Button
          type="button"
          className="w-full"
          disabled={trialBusy || busy !== null || authLoading || gate.status === 'loading'}
          onClick={() => void startTrial()}
        >
          {trialBusy ? t('subscribe.trialStarting') : t('subscribe.trialCta')}
        </Button>
      </div>
    </div>
  ) : null;

  const redeemCode = async () => {
    if (nativeBlocked) {
      toast.message(t('subscribe.useWebsite'), {
        description: t('subscribe.codeWebsiteDesc'),
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
        toast.error(t('subscribe.codeUsed'));
        return;
      }
      if (payloadError === 'invalid_or_exhausted_code' || payloadError === 'invalid_code') {
        toast.error(t('subscribe.codeInvalid'));
        return;
      }
      if (payloadError) {
        toast.error(t('subscribe.codeFailed'));
        return;
      }
      if (error) throw error;
      toast.success(t('subscribe.codeSuccess'));
      await refresh();
      const path = await resolveEntitledPostLoginPath();
      navigate(path, { replace: true });
    } catch (e) {
      console.error(e);
      toast.error(t('subscribe.codeFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-muted/40">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <BrandLogo className="h-8" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            {t('subscribe.signOut')}
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 pb-16 pt-6 sm:px-8">
        <div className="space-y-3 text-center">
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">{t('subscribe.title')}</h1>
          <p className="mx-auto max-w-xl text-muted-foreground">{t('subscribe.subtitle')}</p>
        </div>

        {trial.level === 'expired' ? (
          <div
            role="alert"
            className="mx-auto w-full max-w-2xl rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-center"
          >
            <p className="font-semibold">{t('trial.endedMessage')}</p>
          </div>
        ) : null}

        {trial.level !== 'none' && trial.level !== 'expired' ? (
          <div className="mx-auto w-full max-w-2xl rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center text-sm">
            {t('trial.activeNotice', {
              remaining:
                trial.level === 'urgent'
                  ? t('trial.hoursRemaining', { count: Math.max(1, trial.hoursLeft) })
                  : t('trial.daysRemaining', { count: trial.daysLeft }),
            })}
          </div>
        ) : null}

        {nativeBlocked ? (
          <div className="space-y-4">
            {trialCard ? <div className="mx-auto w-full max-w-sm">{trialCard}</div> : null}
            <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center">
              <p className="text-sm text-muted-foreground">{t('subscribe.nativeTitle')}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t('subscribe.nativeBody')}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mx-auto inline-flex rounded-full border border-border p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setInterval('monthly')}
                className={cn(
                  'rounded-full px-4 py-1.5 transition-colors',
                  interval === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {t('subscribe.monthly')}
              </button>
              <button
                type="button"
                onClick={() => setInterval('yearly')}
                className={cn(
                  'rounded-full px-4 py-1.5 transition-colors',
                  interval === 'yearly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {t('subscribe.yearly')}
              </button>
            </div>

            <div className={cn('grid gap-4', trialCard ? 'sm:grid-cols-2 xl:grid-cols-4' : 'lg:grid-cols-3')}>
              {trialCard}
              {SPEEDVENDORS_TIERS.map((tier) => {
                const plan = SPEEDVENDORS_PLANS[tier];
                const price = advertisedPrice(tier, interval);
                return (
                  <button
                    key={tier}
                    type="button"
                    disabled={checkoutLocked}
                    onClick={() => void startCheckout(tier)}
                    className={cn(
                      'rounded-2xl border bg-card p-6 text-left transition hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                      plan.popular ? 'border-primary shadow-sm ring-1 ring-primary/30' : 'border-border/70',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-muted-foreground">{plan.name}</div>
                      {plan.popular ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                          {t('subscribe.mostPopular')}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight">{price}</div>
                    {interval === 'yearly' ? (
                      <>
                        <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          {t('subscribe.twoMonthsFree')}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('subscribe.monthlyEquivalent', { price: advertisedMonthlyEquivalent(tier) })}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('subscribe.billedYearly', { price })}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t('subscribe.billedMonthly', { price })}
                      </p>
                    )}
                    <p className="mt-3 text-sm text-muted-foreground">
                      {t('subscribe.storage', { size: plan.mediaQuotaGiB })}
                    </p>
                    <div className="mt-6">
                      <span className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                        {busy === tier ? t('subscribe.redirecting') : t('subscribe.continue')}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mx-auto w-full max-w-md space-y-3 border-t border-border/50 pt-8">
              <p className="text-center text-sm text-muted-foreground">{t('subscribe.haveCode')}</p>
              <div className="flex gap-2">
                <Input
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder={t('subscribe.codePlaceholder')}
                  autoComplete="off"
                  className="font-mono"
                />
                <Button
                  variant="secondary"
                  disabled={checkoutLocked || !accessCode.trim()}
                  onClick={() => void redeemCode()}
                >
                  {busy === 'code' ? t('subscribe.applying') : t('subscribe.apply')}
                </Button>
              </div>
            </div>
          </>
        )}

        {!Capacitor.isNativePlatform() && (
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/billing/success" className="underline underline-offset-2">
              {t('subscribe.alreadySubscribedLink')}
            </Link>
          </p>
        )}
      </main>
    </div>
  );
};

export default Subscribe;
