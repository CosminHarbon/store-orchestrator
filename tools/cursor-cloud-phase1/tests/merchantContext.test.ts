/**
 * Phase 2 merchantContext truncation / exclusion unit tests.
 * Run from tools/cursor-cloud-phase1: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCursorStorefrontContext,
  estimateContextChars,
  CONTEXT_EXCLUSIONS,
} from '../../../src/lib/ai-store-builder/merchantContext.ts';

describe('merchantContext', () => {
  it('exports CONTEXT_EXCLUSIONS covering secrets and PII', () => {
    assert.ok(CONTEXT_EXCLUSIONS.some((x) => x.includes('stripe')));
    assert.ok(CONTEXT_EXCLUSIONS.some((x) => x.includes('store_api_key')));
    assert.ok(CONTEXT_EXCLUSIONS.some((x) => /PII/i.test(x)));
  });

  it('truncates descriptions to 280 chars and caps images at 2 by default', () => {
    const long = 'x'.repeat(500);
    const ctx = buildCursorStorefrontContext({
      store: { user_id: 'u1', store_name: 'Demo', currency: 'RON' },
      products: [
        {
          id: 'p1',
          title: 'Widget',
          description: long,
          price: 10,
          images: [
            { url: 'https://cdn.example/1.jpg' },
            { url: 'https://cdn.example/2.jpg' },
            { url: 'https://cdn.example/3.jpg' },
            { url: 'https://cdn.example/4.jpg' },
          ],
        },
      ],
      strategy: { maxProducts: 12 },
    });
    assert.equal(ctx.products.length, 1);
    assert.ok(ctx.products[0].description.length <= 280);
    assert.equal(ctx.products[0].images.length, 2);
  });

  it('defaults maxProducts to 12 when strategy omits it', () => {
    const products = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      title: `P${i}`,
      description: 'd',
      price: i,
    }));
    const ctx = buildCursorStorefrontContext({
      store: { user_id: 'u1', store_name: 'S' },
      products,
    });
    assert.equal(ctx.products.length, 12);
    assert.equal(ctx.strategy.maxProducts, 12);
  });

  it('respects maxProducts and featuredIds order', () => {
    const products = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      title: `P${i}`,
      description: 'd',
      price: i,
    }));
    const ctx = buildCursorStorefrontContext({
      store: { user_id: 'u1', store_name: 'S' },
      products,
      strategy: { maxProducts: 3, featuredIds: ['p7', 'p2'] },
    });
    assert.equal(ctx.products.length, 3);
    assert.equal(ctx.products[0].id, 'p7');
    assert.equal(ctx.products[1].id, 'p2');
    assert.equal(ctx.strategy.maxProducts, 3);
  });

  it('does not embed excluded secret-looking fields from input store blob', () => {
    const ctx = buildCursorStorefrontContext({
      store: {
        user_id: 'u1',
        store_name: 'S',
        contact_email: 'hello@shop.example',
        // @ts-expect-error intentional junk
        stripe_secret: 'sk_live_xxx',
        store_api_key: 'should-not-appear',
      } as never,
      products: [],
    });
    const raw = JSON.stringify(ctx);
    assert.ok(!raw.includes('sk_live'));
    assert.ok(!raw.includes('should-not-appear'));
    assert.ok(raw.includes('hello@shop.example'));
    assert.ok(estimateContextChars(ctx) > 0);
  });
});
