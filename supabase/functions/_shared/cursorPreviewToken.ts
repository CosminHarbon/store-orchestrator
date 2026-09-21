/**
 * Short-lived HMAC preview tokens for iframe storefront preview.
 *
 * Secret resolution:
 *   1. CURSOR_PREVIEW_HMAC_SECRET (preferred)
 *   2. Else SHA-256 of SUPABASE_SERVICE_ROLE_KEY (documented fallback — rotate via env when possible)
 *
 * Token format: `v1.<base64url(payloadJson)>.<base64url(hmacSha256)>`
 * Payload: { v: versionId, u: userId, e: expUnixSeconds }
 * Default TTL: 5 minutes.
 */

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

export async function resolvePreviewHmacRawSecret(): Promise<Uint8Array> {
  const dedicated = Deno.env.get('CURSOR_PREVIEW_HMAC_SECRET')?.trim();
  if (dedicated) return utf8(dedicated);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!serviceKey) {
    throw new Error('preview_hmac_secret_missing');
  }
  // Documented fallback: hash the service role key so the raw key is not used as HMAC key material directly.
  return sha256Bytes(utf8(`cursor-preview-hmac-v1:${serviceKey}`));
}

async function importHmacKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export type PreviewTokenClaims = {
  versionId: string;
  userId: string;
  exp: number;
};

export const PREVIEW_TOKEN_DEFAULT_TTL_SECONDS = 300;

export async function mintPreviewToken(opts: {
  versionId: string;
  userId: string;
  ttlSeconds?: number;
  nowSeconds?: number;
}): Promise<{ token: string; expiresIn: number; exp: number }> {
  const ttl = Math.min(Math.max(opts.ttlSeconds ?? PREVIEW_TOKEN_DEFAULT_TTL_SECONDS, 30), 600);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = now + ttl;
  const payload = JSON.stringify({ v: opts.versionId, u: opts.userId, e: exp });
  const payloadB64 = b64urlEncode(utf8(payload));
  const key = await importHmacKey(await resolvePreviewHmacRawSecret());
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(payloadB64)));
  const token = `v1.${payloadB64}.${b64urlEncode(sig)}`;
  return { token, expiresIn: ttl, exp };
}

export async function verifyPreviewToken(
  token: string,
  opts?: { nowSeconds?: number },
): Promise<PreviewTokenClaims | null> {
  if (typeof token !== 'string' || !token.startsWith('v1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  try {
    const key = await importHmacKey(await resolvePreviewHmacRawSecret());
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(payloadB64)));
    const actual = b64urlDecode(sigB64);
    if (!timingSafeEqual(expected, actual)) return null;

    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as {
      v?: string;
      u?: string;
      e?: number;
    };
    if (!payload.v || !payload.u || typeof payload.e !== 'number') return null;
    const now = opts?.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (payload.e < now) return null;
    return { versionId: payload.v, userId: payload.u, exp: payload.e };
  } catch {
    return null;
  }
}
