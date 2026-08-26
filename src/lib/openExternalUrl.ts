import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/**
 * Open an external URL without navigating away from the SpeedVendors app.
 * Native: Capacitor Browser (in-app browser sheet).
 * Web: new browser tab.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export const NETOPIA_ACCOUNT_URL = 'https://netopia-payments.com';
export const EAWB_ACCOUNT_URL = 'https://www.eawb.ro';

export function goToPaymentsTab() {
  window.dispatchEvent(new CustomEvent('sv:navigate-tab', { detail: 'payments' }));
}

export const STRIPE_DASHBOARD_LIVE_URL = 'https://dashboard.stripe.com';
export const STRIPE_DASHBOARD_TEST_URL = 'https://dashboard.stripe.com/test';

export function stripeDashboardUrl(livemode: boolean): string {
  return livemode ? STRIPE_DASHBOARD_LIVE_URL : STRIPE_DASHBOARD_TEST_URL;
}

/** Open Settings → Integrations → Payment. */
export function goToPaymentSettings() {
  try {
    localStorage.setItem('activeTab', 'settings');
    localStorage.setItem('sv:pending-settings-section', 'payment');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('sv:navigate-tab', { detail: 'settings' }));
  window.dispatchEvent(new CustomEvent('sv:open-settings-section', { detail: 'payment' }));
}

export function notifyStripeConnectReturn(detail: { outcome: 'success' | 'error'; reason?: string }) {
  window.dispatchEvent(new CustomEvent('sv:stripe-connect-return', { detail }));
}

/** Open Settings → Integrations → Delivery (eAWB). */
export function goToShippingSettings() {
  try {
    localStorage.setItem('activeTab', 'settings');
    localStorage.setItem('sv:pending-settings-section', 'delivery');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('sv:navigate-tab', { detail: 'settings' }));
  window.dispatchEvent(new CustomEvent('sv:open-settings-section', { detail: 'delivery' }));
}
