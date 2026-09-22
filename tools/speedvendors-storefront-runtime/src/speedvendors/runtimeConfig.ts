// PROTECTED: public runtime config only. Cursor may not edit this file.
// Never put Stripe / Cursor / Supabase service secrets here.

export type SvRuntimeConfig = {
  storeApiKey: string | null;
  apiBase: string | null;
};

declare global {
  interface Window {
    __SV_RUNTIME__?: {
      storeApiKey?: string;
      apiBase?: string;
      STORE_API_KEY?: string;
      API_BASE?: string;
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
  return { storeApiKey, apiBase };
}

export function hasLiveCommerceConfig(cfg: SvRuntimeConfig = readRuntimeConfig()): boolean {
  return Boolean(cfg.storeApiKey && cfg.apiBase);
}
