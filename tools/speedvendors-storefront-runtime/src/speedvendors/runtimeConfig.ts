// PROTECTED: public runtime config only. Cursor may not edit this file.
// Never put Stripe / Cursor / Supabase service secrets here.

export type SvRuntimeConfig = {
  storeApiKey: string | null;
  apiBase: string | null;
  /**
   * Hosted SpeedVendors checkout origin (Option B).
   * Example: http://127.0.0.1:8080 or https://app.speedvendors.example
   */
  hostedCheckoutOrigin: string | null;
  /**
   * Origin for "return to store" after hosted checkout.
   * Required in srcdoc / opaque-origin iframes where location.origin is "null".
   */
  returnOrigin: string | null;
  /**
   * Rollback/compatibility: use embedded COD CheckoutForm instead of hosted redirect.
   * Set window.__SV_RUNTIME__.useEmbeddedCodCheckout = true or VITE_SV_EMBEDDED_COD_CHECKOUT=true.
   */
  useEmbeddedCodCheckout: boolean;
};

declare global {
  interface Window {
    __SV_RUNTIME__?: {
      storeApiKey?: string;
      apiBase?: string;
      STORE_API_KEY?: string;
      API_BASE?: string;
      hostedCheckoutOrigin?: string;
      HOSTED_CHECKOUT_ORIGIN?: string;
      returnOrigin?: string;
      RETURN_ORIGIN?: string;
      useEmbeddedCodCheckout?: boolean | string;
      USE_EMBEDDED_COD_CHECKOUT?: boolean | string;
    };
  }
}

function readEnv(key: string): string | null {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
    const v = env?.[key];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function readBoolFlag(raw: unknown): boolean {
  if (raw === true || raw === 1) return true;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }
  return false;
}

/** Prefer window.__SV_RUNTIME__, else Vite public env (key is merchant store-api key, not a secret service role). */
export function readRuntimeConfig(): SvRuntimeConfig {
  const win = typeof window !== 'undefined' ? window.__SV_RUNTIME__ : undefined;
  const storeApiKey =
    win?.storeApiKey ||
    win?.STORE_API_KEY ||
    readEnv('VITE_SV_STORE_API_KEY') ||
    null;
  const apiBase =
    win?.apiBase ||
    win?.API_BASE ||
    readEnv('VITE_SV_API_BASE') ||
    null;
  const hostedCheckoutOrigin =
    win?.hostedCheckoutOrigin ||
    win?.HOSTED_CHECKOUT_ORIGIN ||
    readEnv('VITE_SV_CHECKOUT_APP_ORIGIN') ||
    readEnv('VITE_CHECKOUT_APP_ORIGIN') ||
    null;
  const pageOrigin =
    typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null'
      ? window.location.origin
      : null;
  const returnOrigin =
    win?.returnOrigin ||
    win?.RETURN_ORIGIN ||
    readEnv('VITE_SV_RETURN_ORIGIN') ||
    hostedCheckoutOrigin ||
    pageOrigin ||
    null;
  const useEmbeddedCodCheckout =
    readBoolFlag(win?.useEmbeddedCodCheckout) ||
    readBoolFlag(win?.USE_EMBEDDED_COD_CHECKOUT) ||
    readBoolFlag(readEnv('VITE_SV_EMBEDDED_COD_CHECKOUT'));

  return {
    storeApiKey,
    apiBase,
    hostedCheckoutOrigin,
    returnOrigin,
    useEmbeddedCodCheckout,
  };
}

export function hasLiveCommerceConfig(cfg: SvRuntimeConfig = readRuntimeConfig()): boolean {
  return Boolean(cfg.storeApiKey && cfg.apiBase);
}

/** Hosted checkout is the default for live commerce unless embedded rollback is set. */
export function shouldUseHostedCheckout(cfg: SvRuntimeConfig = readRuntimeConfig()): boolean {
  return hasLiveCommerceConfig(cfg) && !cfg.useEmbeddedCodCheckout;
}
