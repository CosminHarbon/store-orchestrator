/**
 * Secure checkout-draft tokens for generated → hosted handoff (Option B1).
 *
 * Capability token = HMAC-SHA256 over a versioned JSON payload.
 * No DB row required for B1 (avoids touching checkout_sessions / Netopia).
 * Server always re-canonicalises items on mint and on resolve.
 */

export const CHECKOUT_DRAFT_TTL_SECONDS = 30 * 60;
export const CHECKOUT_DRAFT_MAX_LINES = 50;
export const CHECKOUT_DRAFT_VERSION = 1 as const;

export type CheckoutDraftLineIn = {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
};

export type CheckoutDraftPayload = {
  v: typeof CHECKOUT_DRAFT_VERSION;
  /** Merchant user_id (bound at mint via store-api key). */
  merchant_user_id: string;
  /** Public storefront API key (same exposure model as /templates?api_key=). */
  store_api_key: string;
  store_name: string;
  items: Array<{ product_id: string; variant_id: string | null; quantity: number }>;
  /** Validated https/http origin for "Return to store". */
  return_origin: string;
  /** Optional path on return_origin (must start with /). */
  return_path: string;
  /** Unix seconds. */
  exp: number;
  iat: number;
  /** Random nonce. */
  jti: string;
};

const UNSAFE_SCHEMES = /^(javascript|data|vbscript|file|blob):/i;

/** Origins always allowed for return / hosted checkout (local + known app hosts). */
export function defaultCheckoutOriginAllowlist(): string[] {
  const fromEnv = (Deno.env.get('CHECKOUT_ORIGIN_ALLOWLIST') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const appOrigin = (Deno.env.get('CHECKOUT_APP_ORIGIN') || '').trim().replace(/\/$/, '');
  const base = [
    'http://127.0.0.1:8080',
    'http://localhost:8080',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:4177',
    'http://localhost:4177',
    'http://127.0.0.1:4173',
    'http://localhost:4173',
  ];
  if (appOrigin) base.push(appOrigin);
  return [...new Set([...base, ...fromEnv])];
}

export function getCheckoutAppOrigin(): string {
  const o = (Deno.env.get('CHECKOUT_APP_ORIGIN') || '').trim().replace(/\/$/, '');
  if (o) return o;
  return 'http://127.0.0.1:8080';
}

export function getDraftHmacSecret(): string {
  const explicit = (Deno.env.get('CHECKOUT_DRAFT_HMAC_SECRET') || '').trim();
  if (explicit.length >= 32) return explicit;
  // Derive from service role so local/prod edge have a stable secret without a new vault entry.
  const sr = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  if (!sr) {
    throw new Error('CHECKOUT_DRAFT_HMAC_SECRET or SUPABASE_SERVICE_ROLE_KEY required');
  }
  return `sv-checkout-draft-v1:${sr}`;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, utf8(message));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Validate return / storefront origin. Rejects open redirects and unsafe schemes.
 */
export function validateReturnOrigin(
  raw: unknown,
  allowlist: string[] = defaultCheckoutOriginAllowlist(),
): { ok: true; origin: string } | { ok: false; error: string; code: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: 'return_origin is required', code: 'INVALID_RETURN_ORIGIN' };
  }
  const trimmed = raw.trim();
  if (UNSAFE_SCHEMES.test(trimmed)) {
    return { ok: false, error: 'Unsafe return URL scheme', code: 'UNSAFE_RETURN_ORIGIN' };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Invalid return_origin', code: 'INVALID_RETURN_ORIGIN' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'return_origin must be http(s)', code: 'UNSAFE_RETURN_ORIGIN' };
  }
  if (url.username || url.password) {
    return { ok: false, error: 'return_origin must not include credentials', code: 'UNSAFE_RETURN_ORIGIN' };
  }
  // Origin only (no path/query in origin field)
  const origin = url.origin;
  const allowed = allowlist.map((a) => a.replace(/\/$/, ''));
  if (!allowed.includes(origin)) {
    return {
      ok: false,
      error: 'return_origin is not on the allowlist',
      code: 'RETURN_ORIGIN_NOT_ALLOWED',
    };
  }
  return { ok: true, origin };
}

export function validateReturnPath(
  raw: unknown,
): { ok: true; path: string } | { ok: false; error: string; code: string } {
  if (raw == null || raw === '') return { ok: true, path: '/' };
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Invalid return_path', code: 'INVALID_RETURN_PATH' };
  }
  const p = raw.trim() || '/';
  if (!p.startsWith('/') || p.startsWith('//') || p.includes('\\') || p.includes('://')) {
    return { ok: false, error: 'Invalid return_path', code: 'INVALID_RETURN_PATH' };
  }
  if (p.length > 512) {
    return { ok: false, error: 'return_path too long', code: 'INVALID_RETURN_PATH' };
  }
  return { ok: true, path: p };
}

export function validateHostedCheckoutOrigin(
  raw: unknown,
  allowlist: string[] = defaultCheckoutOriginAllowlist(),
): { ok: true; origin: string } | { ok: false; error: string; code: string } {
  if (raw == null || raw === '') {
    return { ok: true, origin: getCheckoutAppOrigin() };
  }
  return validateReturnOrigin(raw, allowlist);
}

export async function mintCheckoutDraftToken(
  payload: Omit<CheckoutDraftPayload, 'v' | 'iat' | 'jti' | 'exp'> & { exp?: number },
  secret: string = getDraftHmacSecret(),
): Promise<{ token: string; payload: CheckoutDraftPayload }> {
  const now = Math.floor(Date.now() / 1000);
  const full: CheckoutDraftPayload = {
    v: CHECKOUT_DRAFT_VERSION,
    merchant_user_id: payload.merchant_user_id,
    store_api_key: payload.store_api_key,
    store_name: payload.store_name,
    items: payload.items,
    return_origin: payload.return_origin,
    return_path: payload.return_path,
    iat: now,
    exp: payload.exp ?? now + CHECKOUT_DRAFT_TTL_SECONDS,
    jti: crypto.randomUUID(),
  };
  const body = b64urlEncode(utf8(JSON.stringify(full)));
  const sig = b64urlEncode(await hmacSha256(secret, `v1.${body}`));
  return { token: `v1.${body}.${sig}`, payload: full };
}

export async function verifyCheckoutDraftToken(
  token: unknown,
  secret: string = getDraftHmacSecret(),
): Promise<
  | { ok: true; payload: CheckoutDraftPayload }
  | { ok: false; error: string; code: string; status: number }
> {
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, error: 'draft token required', code: 'DRAFT_TOKEN_REQUIRED', status: 400 };
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return { ok: false, error: 'Invalid draft token', code: 'DRAFT_TOKEN_INVALID', status: 401 };
  }
  const [, body, sig] = parts;
  if (!body || !sig) {
    return { ok: false, error: 'Invalid draft token', code: 'DRAFT_TOKEN_INVALID', status: 401 };
  }
  let expected: Uint8Array;
  let actual: Uint8Array;
  try {
    expected = await hmacSha256(secret, `v1.${body}`);
    actual = b64urlDecode(sig);
  } catch {
    return { ok: false, error: 'Invalid draft token', code: 'DRAFT_TOKEN_INVALID', status: 401 };
  }
  if (!timingSafeEqual(expected, actual)) {
    return { ok: false, error: 'Invalid draft token', code: 'DRAFT_TOKEN_TAMPERED', status: 401 };
  }
  let payload: CheckoutDraftPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as CheckoutDraftPayload;
  } catch {
    return { ok: false, error: 'Invalid draft token', code: 'DRAFT_TOKEN_INVALID', status: 401 };
  }
  if (payload.v !== CHECKOUT_DRAFT_VERSION) {
    return { ok: false, error: 'Unsupported draft version', code: 'DRAFT_TOKEN_INVALID', status: 401 };
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    return { ok: false, error: 'Checkout draft has expired', code: 'DRAFT_EXPIRED', status: 410 };
  }
  if (!payload.merchant_user_id || !payload.store_api_key || !Array.isArray(payload.items)) {
    return { ok: false, error: 'Invalid draft payload', code: 'DRAFT_TOKEN_INVALID', status: 401 };
  }
  return { ok: true, payload };
}

export function buildHostedCheckoutUrl(appOrigin: string, token: string): string {
  const base = appOrigin.replace(/\/$/, '');
  return `${base}/checkout?draft=${encodeURIComponent(token)}`;
}
