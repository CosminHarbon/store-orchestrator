/**
 * Focused tests for B1 checkout-draft HMAC + allowlist (local server logic).
 * Run: node --test tools/b1-checkout-draft-server/draftSecurity.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET = 'sv-checkout-draft-v1:test-secret-at-least-32-chars!!';

function mint(payload, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(`v1.${body}`).digest('base64url');
  return `v1.${body}.${sig}`;
}

function verify(token, secret = SECRET) {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const [, body, sig] = parts;
  const expected = createHmac('sha256', secret).update(`v1.${body}`).digest();
  const actual = Buffer.from(sig, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp < Math.floor(Date.now() / 1000)) return { expired: true };
  return { payload };
}

describe('checkout draft token security', () => {
  it('accepts a valid token', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = mint({
      v: 1,
      merchant_user_id: 'f30cbfb8-eeb4-4ccf-8c95-8a8de505d7e5',
      store_api_key: '00000000-0000-4000-8000-000000000001',
      store_name: 'My Store',
      items: [{ product_id: '3ef134f6-c8f7-48c2-b0e3-aaf4bacc4b64', variant_id: null, quantity: 2 }],
      return_origin: 'http://127.0.0.1:4177',
      return_path: '/',
      iat: now,
      exp: now + 60,
      jti: 'test',
    });
    const v = verify(token);
    assert.ok(v?.payload);
    assert.equal(v.payload.items[0].quantity, 2);
  });

  it('rejects tampered payload', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = mint({
      v: 1,
      merchant_user_id: 'f30cbfb8-eeb4-4ccf-8c95-8a8de505d7e5',
      store_api_key: '00000000-0000-4000-8000-000000000001',
      store_name: 'My Store',
      items: [{ product_id: '3ef134f6-c8f7-48c2-b0e3-aaf4bacc4b64', variant_id: null, quantity: 1 }],
      return_origin: 'http://127.0.0.1:4177',
      return_path: '/',
      iat: now,
      exp: now + 60,
      jti: 'test',
    });
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    payload.items[0].quantity = 99;
    const tamperedBody = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tampered = `v1.${tamperedBody}.${parts[2]}`;
    assert.equal(verify(tampered), null);
  });

  it('rejects expired token', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = mint({
      v: 1,
      merchant_user_id: 'f30cbfb8-eeb4-4ccf-8c95-8a8de505d7e5',
      store_api_key: '00000000-0000-4000-8000-000000000001',
      store_name: 'My Store',
      items: [{ product_id: '3ef134f6-c8f7-48c2-b0e3-aaf4bacc4b64', variant_id: null, quantity: 1 }],
      return_origin: 'http://127.0.0.1:4177',
      return_path: '/',
      iat: now - 120,
      exp: now - 60,
      jti: 'test',
    });
    const v = verify(token);
    assert.equal(v?.expired, true);
  });

  it('rejects wrong hmac secret', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = mint({
      v: 1,
      merchant_user_id: 'f30cbfb8-eeb4-4ccf-8c95-8a8de505d7e5',
      store_api_key: '00000000-0000-4000-8000-000000000001',
      store_name: 'My Store',
      items: [],
      return_origin: 'http://127.0.0.1:4177',
      return_path: '/',
      iat: now,
      exp: now + 60,
      jti: 'test',
    });
    assert.equal(verify(token, 'different-secret-also-long-enough-32ch'), null);
  });
});

describe('return origin allowlist policy', () => {
  const UNSAFE = /^(javascript|data|vbscript|file|blob):/i;
  const ALLOW = new Set(['http://127.0.0.1:8080', 'http://127.0.0.1:4177']);

  function check(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return 'INVALID';
    if (UNSAFE.test(raw)) return 'UNSAFE';
    let url;
    try {
      url = new URL(raw.trim());
    } catch {
      return 'INVALID';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'UNSAFE';
    if (url.username || url.password) return 'UNSAFE';
    if (!ALLOW.has(url.origin)) return 'NOT_ALLOWED';
    return 'OK';
  }

  it('allows localhost app origin', () => {
    assert.equal(check('http://127.0.0.1:8080'), 'OK');
  });
  it('rejects javascript:', () => {
    assert.equal(check('javascript:alert(1)'), 'UNSAFE');
  });
  it('rejects data:', () => {
    assert.equal(check('data:text/html,hi'), 'UNSAFE');
  });
  it('rejects arbitrary https host', () => {
    assert.equal(check('https://evil.example'), 'NOT_ALLOWED');
  });
});
