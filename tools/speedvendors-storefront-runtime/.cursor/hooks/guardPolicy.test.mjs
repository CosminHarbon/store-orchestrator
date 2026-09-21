/**
 * Narrow path-policy checks for the storefront runtime hook guard.
 * Run: node --test .cursor/hooks/guardPolicy.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pathDecision, isEditableRel } from './guardPolicy.mjs';

const ctx = { workspace: '/workspace' };

test('allows repo-relative artifacts/ marker', () => {
  assert.equal(isEditableRel('artifacts/phase1-live-marker.txt'), true);
  assert.equal(pathDecision('artifacts/phase1-live-marker.txt', 'write', ctx).permission, 'allow');
});

test('allows only /opt/cursor/artifacts mount (not broader /opt/cursor)', () => {
  assert.equal(
    pathDecision('/opt/cursor/artifacts/phase1-live-marker.txt', 'write', ctx).permission,
    'allow',
  );
  assert.equal(pathDecision('/opt/cursor/secrets/x', 'write', ctx).permission, 'deny');
  assert.equal(pathDecision('/opt/cursor/other.txt', 'write', ctx).permission, 'deny');
});

test('still protects commerce and env paths', () => {
  assert.equal(pathDecision('src/speedvendors/commerce.ts', 'write', ctx).permission, 'deny');
  assert.equal(pathDecision('.env', 'write', ctx).permission, 'deny');
  assert.equal(pathDecision('src/styles/storefront.css', 'write', ctx).permission, 'allow');
});
