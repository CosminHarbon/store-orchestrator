/**
 * Narrow path-policy checks for the storefront runtime hook guard.
 * Run: node --test .cursor/hooks/guardPolicy.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pathDecision, isEditableRel, shellDecision } from './guardPolicy.mjs';

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

test('allows storefront-bundle under /opt/cursor/artifacts', () => {
  assert.equal(
    pathDecision('/opt/cursor/artifacts/storefront-bundle/MARKER.txt', 'write', ctx).permission,
    'allow',
  );
  assert.equal(
    pathDecision('/opt/cursor/artifacts/storefront-bundle/dist/index.html', 'write', ctx).permission,
    'allow',
  );
});

test('still protects commerce and env paths', () => {
  assert.equal(pathDecision('src/speedvendors/commerce.ts', 'write', ctx).permission, 'deny');
  assert.equal(pathDecision('src/speedvendors/storeApiCommerce.ts', 'write', ctx).permission, 'deny');
  assert.equal(pathDecision('.env', 'write', ctx).permission, 'deny');
  assert.equal(pathDecision('src/styles/storefront.css', 'write', ctx).permission, 'allow');
});

test('allows packaging commands into /opt/cursor/artifacts only', () => {
  assert.equal(
    shellDecision('mkdir -p /opt/cursor/artifacts/storefront-bundle', undefined, ctx).permission,
    'allow',
  );
  assert.equal(shellDecision('mkdir -p /tmp/evil', undefined, ctx).permission, 'deny');
  assert.equal(
    shellDecision('cp -R dist /opt/cursor/artifacts/storefront-bundle/dist', undefined, ctx).permission,
    'allow',
  );
  assert.equal(shellDecision('cp -R dist /tmp/evil', undefined, ctx).permission, 'deny');
  assert.equal(
    shellDecision(
      'tar -czf /opt/cursor/artifacts/storefront-bundle/dist.tar.gz -C dist .',
      undefined,
      ctx,
    ).permission,
    'allow',
  );
  assert.equal(
    shellDecision(
      'tar -czf /opt/cursor/artifacts/storefront-build.tar.gz -C dist .',
      undefined,
      ctx,
    ).permission,
    'allow',
  );
});

test('allows npm ci / npm install bootstrap (no package args)', () => {
  assert.equal(shellDecision('npm ci', undefined, ctx).permission, 'allow');
  assert.equal(shellDecision('npm install', undefined, ctx).permission, 'allow');
  assert.equal(
    shellDecision('npm install --no-audit --no-fund', undefined, ctx).permission,
    'allow',
  );
  assert.equal(shellDecision('npm install lodash', undefined, ctx).permission, 'deny');
  assert.equal(shellDecision('npm ci lodash', undefined, ctx).permission, 'deny');
});

test('allows npm build / package-artifact / build:artifact only', () => {
  assert.equal(shellDecision('npm run build', undefined, ctx).permission, 'allow');
  assert.equal(shellDecision('npm run package-artifact', undefined, ctx).permission, 'allow');
  assert.equal(shellDecision('npm run build:artifact', undefined, ctx).permission, 'allow');
  assert.equal(shellDecision('npm run preview', undefined, ctx).permission, 'deny');
  assert.equal(shellDecision('npm run test:guard', undefined, ctx).permission, 'deny');
});
