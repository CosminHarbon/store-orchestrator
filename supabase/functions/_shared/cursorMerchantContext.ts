/**
 * Deno merchant context builder for Cursor storefront prompts.
 * Prefers fetching catalog via store-api using profiles.store_api_key.
 */

import {
  buildCursorStorefrontContext,
  estimateContextChars,
  CONTEXT_EXCLUSIONS,
  type CursorStorefrontContext,
  type MerchantContextInput,
  type MerchantContextStrategy,
} from './cursorMerchantContextCore.ts';

export {
  buildCursorStorefrontContext,
  estimateContextChars,
  CONTEXT_EXCLUSIONS,
  type CursorStorefrontContext,
  type MerchantContextStrategy,
};

const DEFAULT_STORE_API_BASE =
  Deno.env.get('STORE_API_BASE') ||
  `${Deno.env.get('SUPABASE_URL') || ''}/functions/v1/store-api`;

type AdminClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
        single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
};

async function fetchJson(url: string, apiKey: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((data as { error?: string }).error || `HTTP ${res.status}`));
  return data;
}

export async function loadMerchantContextFromStoreApi(opts: {
  admin: AdminClient;
  userId: string;
  strategy?: MerchantContextStrategy;
  /** Optional preloaded catalog — skips network when provided. */
  preloaded?: {
    store?: MerchantContextInput['store'];
    products?: MerchantContextInput['products'];
    collections?: MerchantContextInput['collections'];
  };
  storeApiBase?: string;
}): Promise<{ context: CursorStorefrontContext; chars: number; source: 'store-api' | 'preloaded' }> {
  if (opts.preloaded?.store && opts.preloaded.products) {
    const context = buildCursorStorefrontContext({
      store: opts.preloaded.store,
      products: opts.preloaded.products,
      collections: opts.preloaded.collections || [],
      strategy: opts.strategy,
    });
    return { context, chars: estimateContextChars(context), source: 'preloaded' };
  }

  const { data: profile, error } = await opts.admin
    .from('profiles')
    .select('user_id, store_name, store_api_key, preferred_language')
    .eq('user_id', opts.userId)
    .maybeSingle();

  if (error || !profile?.store_api_key) {
    throw new Error('store_api_key_missing');
  }

  const apiKey = String(profile.store_api_key);
  const base = (opts.storeApiBase || DEFAULT_STORE_API_BASE).replace(/\/$/, '');

  const [config, productsData, collectionsData] = await Promise.all([
    fetchJson(`${base}/config`, apiKey),
    fetchJson(`${base}/products`, apiKey),
    fetchJson(`${base}/collections`, apiKey).catch(() => ({ collections: [] })),
  ]);

  const cfg = config as Record<string, unknown>;
  const customization = (cfg.customization || {}) as Record<string, unknown>;
  const productList = Array.isArray(productsData)
    ? productsData
    : ((productsData as { products?: unknown[] }).products || []);
  const colList = Array.isArray(collectionsData)
    ? collectionsData
    : ((collectionsData as { collections?: unknown[] }).collections || []);

  // Public storefront contact only when present on config/customization — never staff secrets.
  const publicEmail =
    typeof customization.contact_email === 'string'
      ? customization.contact_email
      : typeof cfg.contact_email === 'string'
        ? cfg.contact_email
        : null;

  const context = buildCursorStorefrontContext({
    store: {
      user_id: opts.userId,
      store_name: String(cfg.store_name || customization.store_name || profile.store_name || 'Store'),
      logo_url: (customization.logo_url as string) ?? null,
      currency: 'RON',
      preferred_language: String(cfg.preferred_language || profile.preferred_language || 'ro'),
      tagline: String(customization.hero_subtitle || ''),
      contact_email: publicEmail,
    },
    products: productList as MerchantContextInput['products'],
    collections: colList as MerchantContextInput['collections'],
    strategy: opts.strategy,
  });

  return { context, chars: estimateContextChars(context), source: 'store-api' };
}
