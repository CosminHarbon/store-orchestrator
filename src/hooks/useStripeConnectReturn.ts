import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  goToPaymentSettings,
  notifyStripeConnectReturn,
} from '@/lib/openExternalUrl';
import { parseStripeConnectReturnUrl } from '@/lib/stripeConnectReturn';

function applyStripeConnectReturn(
  parsed: { outcome: 'success' | 'error'; reason?: string },
  t: (key: string, opts?: Record<string, string>) => string,
) {
  goToPaymentSettings();
  notifyStripeConnectReturn(parsed);
  if (parsed.outcome === 'success') {
    toast.success(t('stripeConnect.toast.connected'));
  } else {
    const reasonKey = parsed.reason
      ? `stripeConnect.errors.${parsed.reason}`
      : 'stripeConnect.errors.server_error';
    toast.error(t(reasonKey));
  }
}

/**
 * Completes Stripe Connect return on web (/app?stripe_connect=) and native custom schemes.
 * Does not exchange OAuth codes — the Edge Function already did that.
 */
export function useStripeConnectReturn() {
  const { t } = useTranslation('settings');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== '/app') return;
    const parsed = parseStripeConnectReturnUrl(
      `${window.location.origin}${location.pathname}${location.search}`,
    );
    if (!parsed) return;
    applyStripeConnectReturn(parsed, t);
    navigate('/app', { replace: true });
  }, [location.pathname, location.search, navigate, t]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listener: { remove: () => Promise<void> } | undefined;
    let cancelled = false;

    void App.addListener('appUrlOpen', (event) => {
      const parsed = parseStripeConnectReturnUrl(event.url);
      if (!parsed) return;
      void Browser.close().catch(() => undefined);
      if (location.pathname !== '/app') {
        navigate('/app', { replace: true });
      }
      applyStripeConnectReturn(parsed, t);
    }).then((handle) => {
      if (cancelled) {
        void handle.remove();
        return;
      }
      listener = handle;
    });

    return () => {
      cancelled = true;
      void listener?.remove();
    };
  }, [location.pathname, navigate, t]);
}
