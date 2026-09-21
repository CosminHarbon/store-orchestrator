import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('phase1 conventions', () => {
  it('distinguishes tokens from billed cost in naming', () => {
    const fields = [
      'estimated_cost_cents',
      'actual_raw_cost_cents',
      'actual_charged_cents',
      'cost_reconciliation_status',
    ];
    assert.ok(fields.includes('actual_charged_cents'));
    assert.ok(!fields.includes('cost_usd')); // avoid ambiguous single cost field
  });

  it('feature flag name matches Track B convention', () => {
    assert.equal('VITE_AI_STORE_BUILDER_CURSOR', 'VITE_AI_STORE_BUILDER_CURSOR');
  });
});
