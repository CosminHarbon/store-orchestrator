import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import type { EntitlementStatus } from '@/hooks/useEntitlementGate';
import { payloadFromFunctionsInvoke } from '@/lib/edgeFunctionPayload';
import { advertisedPrice } from '@/lib/marketingPricing';
import { parseInterval, parseTier, SPEEDVENDORS_PLANS } from '@/lib/plans/catalogue';
import { formatBytes } from '@/lib/media/constants';
import { useMediaUsage } from '@/hooks/useMediaUsage';
import { Capacitor } from '@capacitor/core';
import { TrialStatusCard } from '@/components/billing/TrialStatusCard';
import { toIntlLocale } from '@/i18n/types';
import type { AppLanguage } from '@/i18n/types';

function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function statusLabel(
  t: (key: string, opts?: Record<string, string>) => string,
  sub: EntitlementStatus['subscription'],
  locale: string,
): string {
  if (!sub?.status) return t('saasBilling.statusNone');
  if (sub.status === 'active' && sub.cancel_at_period_end) {
    return t('saasBilling.statusActiveCancels', {
      date: formatDate(sub.current_period_end, locale),
    });
  }
  if (sub.status === 'active') return t('saasBilling.statusActive');
  return sub.status;
}

function tierLabel(
  t: (key: string) => string,
  tier: string | null | undefined,
): string {
  if (tier === 'growth') return t('saasBilling.tierGrowth');
  if (tier === 'scale') return t('saasBilling.tierScale');
  if (tier === 'start') return t('saasBilling.tierStart');
  return '—';
}

function intervalLabel(
  t: (key: string) => string,
  interval: string | null | undefined,
): string {
  const parsed = parseInterval(interval);
  if (parsed === 'yearly') return t('saasBilling.frequencyYearly');
  if (parsed === 'monthly') return t('saasBilling.frequencyMonthly');
  return '—';
}

/**
 * Settings → Billing. Uses Stripe Customer Portal for payment method / cancel / reactivate.
 * Native apps show read-only status (portal/purchase on web).
 */
export function BillingSettingsCard() {
  const { t, i18n } = useTranslation('settings');
  const locale = toIntlLocale((i18n.language === 'en' ? 'en' : 'ro') as AppLanguage);
  const [changeBusy, setChangeBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const { data: usage } = useMediaUsage();
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['entitlement-status'],
    queryFn: async () => {
      const { data: rpc, error } = await supabase.rpc('get_my_entitlement_status');
      if (error) throw error;
      return rpc as EntitlementStatus;
    },
  });

  const openPortal = async () => {
    if (Capacitor.isNativePlatform()) {
      toast.message(t('saasBilling.portalNative'), {
        description: t('saasBilling.portalNativeDesc'),
      });
      return;
    }
    setPortalBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke(
        'billing-create-portal-session',
        { body: { client_surface: Capacitor.isNativePlatform() ? 'native' : 'web' } },
      );
      const payload = await payloadFromFunctionsInvoke(res, error);
      if (payload.error === 'billing_not_configured') {
        toast.error(t('saasBilling.notConfigured'));
        return;
      }
      const url = typeof payload.url === 'string' ? payload.url : '';
      if (!url) {
        toast.error(t('saasBilling.portalFailed'));
        return;
      }
      window.location.assign(url);
    } catch (e) {
      console.error(e);
      toast.error(t('saasBilling.portalFailed'));
    } finally {
      setPortalBusy(false);
    }
  };

  const changePlan = async (tier: 'start' | 'growth' | 'scale', interval: 'monthly' | 'yearly') => {
    if (Capacitor.isNativePlatform()) {
      toast.message(t('saasBilling.portalNative'), {
        description: t('saasBilling.portalNativeDesc'),
      });
      return;
    }
    setChangeBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('billing-change-subscription', {
        body: {
          tier,
          interval,
          client_surface: Capacitor.isNativePlatform() ? 'native' : 'web',
        },
      });
      const payload = await payloadFromFunctionsInvoke(res, error);
      if (payload.error === 'native_billing_blocked') {
        toast.message(t('saasBilling.portalNative'));
        return;
      }
      if (payload.error || error) {
        toast.error(t('saasBilling.changeFailed'));
        return;
      }
      if (payload.kind === 'downgrade') {
        toast.success(t('saasBilling.changeScheduled'));
      } else if (payload.unchanged) {
        toast.message(t('saasBilling.changePlan'));
      } else {
        toast.success(t('saasBilling.changeUpgraded'));
      }
      await refetch();
    } catch (e) {
      console.error(e);
      toast.error(t('saasBilling.changeFailed'));
    } finally {
      setChangeBusy(false);
    }
  };
  const warning = data?.billing_warning;
  const sub = data?.subscription;
  const canceling = sub?.status === 'active' && sub.cancel_at_period_end === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('saasBilling.title')}</CardTitle>
        <CardDescription>{t('saasBilling.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TrialStatusCard />
        {warning === 'duplicate_open_subscription' ? (
          <Alert variant="destructive">
            <AlertDescription>{t('saasBilling.duplicateWarning')}</AlertDescription>
          </Alert>
        ) : warning ? (
          <Alert variant="destructive">
            <AlertDescription>
              {t('saasBilling.paymentWarning')}
              {data?.grace_until
                ? ` ${t('saasBilling.graceUntil', { date: formatDate(data.grace_until, locale) })}`
                : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('saasBilling.loading')}</p>
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t('saasBilling.plan')}</dt>
              <dd className="font-medium">{tierLabel(t, sub?.tier)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('saasBilling.frequency')}</dt>
              <dd className="font-medium">{intervalLabel(t, sub?.plan || sub?.billing_interval)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('saasBilling.price')}</dt>
              <dd className="font-medium">
                {(() => {
                  const tier = parseTier(sub?.tier);
                  const interval = parseInterval(sub?.plan) || parseInterval(sub?.billing_interval);
                  if (!tier || !interval) return '—';
                  return advertisedPrice(tier, interval);
                })()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('saasBilling.renewal')}</dt>
              <dd className="font-medium">{formatDate(sub?.current_period_end, locale)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t('saasBilling.status')}</dt>
              <dd className="font-medium">{statusLabel(t, sub, locale)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t('saasBilling.storage.title')}</dt>
              <dd className="font-medium">
                {usage
                  ? t('saasBilling.storage.usedOf', {
                      used: formatBytes(usage.bytes_used),
                      quota: formatBytes(usage.quota_bytes),
                    })
                  : '—'}
              </dd>
            </div>
            {sub?.pending_tier && sub.pending_effective_at ? (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">
                  {t('saasBilling.pendingChange', {
                    plan: SPEEDVENDORS_PLANS[parseTier(sub.pending_tier) || 'start'].name,
                    interval: intervalLabel(t, sub.pending_interval),
                    date: formatDate(sub.pending_effective_at, locale),
                  })}
                </p>
              </div>
            ) : null}
          </dl>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void openPortal()} disabled={portalBusy}>
            {portalBusy
              ? t('saasBilling.opening')
              : canceling
                ? t('saasBilling.reactivate')
                : t('saasBilling.manage')}
          </Button>
          <Button variant="outline" onClick={() => void refetch()}>
            {t('saasBilling.refresh')}
          </Button>
        </div>

        {!Capacitor.isNativePlatform() && sub?.status && ['active', 'trialing', 'past_due'].includes(sub.status) && !canceling ? (
          <div className="space-y-2 border-t border-border/60 pt-4">
            <p className="text-sm font-medium">{t('saasBilling.changePlan')}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(['start', 'growth', 'scale'] as const).map((tier) => (
                <Button
                  key={tier}
                  variant="outline"
                  size="sm"
                  disabled={changeBusy}
                  onClick={() => void changePlan(tier, parseInterval(sub.plan) || parseInterval(sub.billing_interval) || 'monthly')}
                >
                  {SPEEDVENDORS_PLANS[tier].name}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={changeBusy}
                onClick={() => void changePlan(parseTier(sub.tier) || 'start', 'monthly')}
              >
                {t('saasBilling.frequencyMonthly')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={changeBusy}
                onClick={() => void changePlan(parseTier(sub.tier) || 'start', 'yearly')}
              >
                {t('saasBilling.frequencyYearly')}
              </Button>
            </div>
            {changeBusy ? (
              <p className="text-xs text-muted-foreground">{t('saasBilling.changing')}</p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
