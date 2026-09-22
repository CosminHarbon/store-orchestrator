/**
 * Phase 3: checkout contract + generation prompt speed/checkout constraints.
 * Run from tools/cursor-cloud-phase1: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  buildFollowupPrompt,
  buildGenerationPrompt,
} from '../../../supabase/functions/_shared/cursorGenerationPrompt.ts';
import { createMockCommerce } from '../../speedvendors-storefront-runtime/src/speedvendors/mockCommerce.ts';
import { createStoreApiCommerce } from '../../speedvendors-storefront-runtime/src/speedvendors/storeApiCommerce.ts';
import { EXPECTED_PROTECTED_COMMERCE_SHA256 } from '../../../supabase/functions/_shared/cursorProtectedCommerce.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(__dirname, '../../speedvendors-storefront-runtime');

const validCheckout = {
  name: 'Ana Pop',
  email: 'ana@example.com',
  phone: '0700123456',
  street: 'Strada Exemplu',
  streetNumber: '12A',
  city: 'București',
  county: 'București',
  notes: 'Ring doorbell',
  paymentMethod: 'cash' as const,
};

async function seedMockCart() {
  const commerce = createMockCommerce();
  // Accessories without size variants
  await commerce.cart.addItem('p-scarf', null, 1);
  assert.ok(commerce.cart.get().itemCount >= 1, 'mock cart should have items');
  return commerce;
}

describe('generation prompts', () => {
  it('includes checkout contract and speed budget', () => {
    const p = buildGenerationPrompt('Make it warmer', { store: { name: 'Demo' } });
    assert.match(p, /Speed budget/i);
    assert.match(p, /build:artifact.*ONCE/i);
    assert.match(p, /Checkout contract/i);
    assert.match(p, /Cash on delivery ONLY/i);
    assert.match(p, /streetNumber/);
    assert.match(p, /useCheckout/);
  });

  it('follow-up preserves checkout wiring', () => {
    const p = buildFollowupPrompt('Bigger hero', 'ver-1');
    assert.match(p, /Preserve checkout wiring/i);
    assert.match(p, /COD-only/i);
    assert.match(p, /build:artifact.*once/i);
  });
});

describe('mock checkout contract', () => {
  it('accepts structured COD checkout', async () => {
    const commerce = await seedMockCart();
    const result = await commerce.checkout.submit(validCheckout);
    assert.equal(result.ok, true);
    if (result.ok) assert.match(result.orderId, /^MOCK-/);
  });

  it('rejects missing structured address fields', async () => {
    const commerce = await seedMockCart();
    const result = await commerce.checkout.submit({
      ...validCheckout,
      city: '',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /city/i);
  });

  it('rejects missing phone', async () => {
    const commerce = await seedMockCart();
    const result = await commerce.checkout.submit({
      ...validCheckout,
      phone: '  ',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /phone/i);
  });
});

describe('storeApiCommerce checkout payload', () => {
  it('POSTs structured customer_* fields and cash/home delivery', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const originalFetch = globalThis.fetch;

    const product = {
      id: 'prod-1',
      title: 'Tee',
      price: 50,
      images: [],
      in_stock: true,
      variants: [],
    };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/config') || url.includes('/config')) {
        return new Response(
          JSON.stringify({
            store_name: 'Test',
            currency: 'RON',
            customization: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/products')) {
        return new Response(JSON.stringify({ products: [product] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/collections')) {
        return new Response(JSON.stringify({ collections: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/orders')) {
        const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        calls.push({ url, body });
        return new Response(JSON.stringify({ order: { id: 'ord-99' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: `unhandled ${url}` }), { status: 404 });
    }) as typeof fetch;

    try {
      const commerce = createStoreApiCommerce({
        apiKey: 'test-key',
        baseUrl: 'https://example.test/functions/v1/store-api',
      });
      await commerce.cart.addItem('prod-1', null, 1);
      assert.equal(commerce.cart.get().itemCount, 1);

      const result = await commerce.checkout.submit(validCheckout);
      assert.equal(result.ok, true);
      assert.equal(calls.length, 1);
      const payload = calls[0].body;
      assert.equal(payload.payment_method, 'cash');
      assert.equal(payload.delivery_type, 'home');
      assert.equal(payload.customer_street, 'Strada Exemplu');
      assert.equal(payload.customer_street_number, '12A');
      assert.equal(payload.customer_city, 'București');
      assert.equal(payload.customer_county, 'București');
      assert.equal(payload.customer_phone, '0700123456');
      assert.equal(payload.customer_name, 'Ana Pop');
      assert.notEqual(payload.customer_city, 'N/A');
      assert.notEqual(payload.customer_street_number, '1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not invent N/A city when city is missing — fails client-side', async () => {
    const originalFetch = globalThis.fetch;
    const product = {
      id: 'prod-1',
      title: 'Tee',
      price: 50,
      images: [],
      in_stock: true,
      variants: [],
    };
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/config')) {
        return new Response(JSON.stringify({ store_name: 'Test', customization: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/products')) {
        return new Response(JSON.stringify({ products: [product] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/collections')) {
        return new Response(JSON.stringify({ collections: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    try {
      const commerce = createStoreApiCommerce({
        apiKey: 'test-key',
        baseUrl: 'https://example.test/functions/v1/store-api',
      });
      await commerce.cart.addItem('prod-1', null, 1);
      const result = await commerce.checkout.submit({ ...validCheckout, city: '' });
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.error, /city/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('CheckoutForm seed + protected hashes', () => {
  it('CheckoutForm is COD-only with structured fields', () => {
    const src = readFileSync(path.join(RUNTIME, 'src/speedvendors/ui/CheckoutForm.tsx'), 'utf8');
    assert.match(src, /streetNumber/);
    assert.match(src, /paymentMethod: 'cash'/);
    assert.doesNotMatch(src, /setPaymentMethod/);
    assert.doesNotMatch(src, /paymentMethod === 'card'/);
    assert.match(src, /Cash on delivery/);
  });

  it('EXPECTED hashes match runtime tip files', () => {
    for (const [rel, want] of Object.entries(EXPECTED_PROTECTED_COMMERCE_SHA256)) {
      const bytes = readFileSync(path.join(RUNTIME, rel));
      const got = createHash('sha256').update(bytes).digest('hex');
      assert.equal(got, want, rel);
    }
  });
});
