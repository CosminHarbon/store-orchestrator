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
