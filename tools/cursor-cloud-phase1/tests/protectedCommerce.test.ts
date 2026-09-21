/**
 * Unit tests for protected commerce hash gate.
 * Run from tools/cursor-cloud-phase1: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertProtectedCommerceHashes,
  EXPECTED_PROTECTED_COMMERCE_SHA256,
  PROTECTED_COMMERCE_FILES,
} from '../../../supabase/functions/_shared/cursorProtectedCommerce.ts';

describe('assertProtectedCommerceHashes', () => {
  it('skips when protectedCommerceSha256 missing (old packages)', () => {
    assert.deepEqual(assertProtectedCommerceHashes({}), {
      ok: true,
      skipped: true,
      reason: 'missing_map',
    });
    assert.deepEqual(assertProtectedCommerceHashes(null), {
      ok: true,
      skipped: true,
      reason: 'missing_map',
    });
    assert.deepEqual(assertProtectedCommerceHashes({ protectedCommerceSha256: null }), {
      ok: true,
      skipped: true,
      reason: 'missing_map',
    });
  });

  it('passes when hashes match EXPECTED', () => {
    const r = assertProtectedCommerceHashes({
      protectedCommerceSha256: { ...EXPECTED_PROTECTED_COMMERCE_SHA256 },
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.skipped, false);
  });

  it('fails when a protected file hash mismatches', () => {
    const bad = { ...EXPECTED_PROTECTED_COMMERCE_SHA256 };
    bad['src/speedvendors/commerce.ts'] = '0'.repeat(64);
    const r = assertProtectedCommerceHashes({ protectedCommerceSha256: bad });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, 'protected_commerce_hash_mismatch');
      assert.ok(r.mismatches.some((m) => m.includes('commerce.ts')));
    }
  });

  it('fails when an expected key is missing from the package map', () => {
    const partial = { ...EXPECTED_PROTECTED_COMMERCE_SHA256 };
    delete partial['src/speedvendors/hooks.tsx'];
    const r = assertProtectedCommerceHashes({ protectedCommerceSha256: partial });
    assert.equal(r.ok, false);
  });

  it('lists all protected commerce paths', () => {
    assert.ok(PROTECTED_COMMERCE_FILES.includes('src/speedvendors/commerce.ts'));
    assert.ok(PROTECTED_COMMERCE_FILES.includes('src/speedvendors/hooks.tsx'));
    assert.equal(PROTECTED_COMMERCE_FILES.length, 5);
  });
});
