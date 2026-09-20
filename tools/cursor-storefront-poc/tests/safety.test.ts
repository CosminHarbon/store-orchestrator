import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SafetyError, assertSafeRelativePath, isEditablePath, safeJoin, validateMerchantId } from '../src/protectedFiles.ts';

describe('merchant slug validation', () => {
  for (const ok of ['demo-fashion', 'a', 'shop2', 'a-b-c', 'x'.repeat(40)]) {
    it(`accepts ${ok.slice(0, 20)}`, () => assert.equal(validateMerchantId(ok), ok));
  }
  for (const bad of [
    '', ' ', 'Demo', 'demo_fashion', 'demo fashion', '-demo', 'demo-', 'de--mo', '.', '..', '../x', 'a/b', 'a\\b',
    'x'.repeat(41), 'demo.fashion', '~', '/etc', 'demo\0', 'demo\n', 'ünï',
  ]) {
    it(`rejects ${JSON.stringify(bad).slice(0, 30)}`, () => assert.throws(() => validateMerchantId(bad), SafetyError));
  }
  it('rejects non-strings', () => {
    assert.throws(() => validateMerchantId(undefined), SafetyError);
    assert.throws(() => validateMerchantId(42), SafetyError);
  });
});

describe('path traversal rejection', () => {
  for (const bad of ['../x', 'a/../../x', '/etc/passwd', '~/x', 'a\\b', '', '..', 'src/../../x', 'a\0b']) {
    it(`assertSafeRelativePath rejects ${JSON.stringify(bad)}`, () => assert.throws(() => assertSafeRelativePath(bad), SafetyError));
    it(`safeJoin rejects ${JSON.stringify(bad)}`, () => assert.throws(() => safeJoin('/tmp/base', bad), SafetyError));
  }
  it('safeJoin keeps normal paths inside the base', () => {
    assert.equal(safeJoin('/tmp/base', 'src/a.tsx'), '/tmp/base/src/a.tsx');
  });
});

describe('allowed-path validation', () => {
  for (const ok of ['src/storefront/App.tsx', 'src/components/Header.tsx', 'src/styles/a.css', 'public/img/a.svg', 'src/storefront/deep/er/x.ts']) {
    it(`editable: ${ok}`, () => assert.equal(isEditablePath(ok), true));
  }
  for (const no of [
    'src/speedvendors/commerce.ts', 'src/speedvendors/types.ts', 'src/main.tsx', 'package.json', 'package-lock.json',
    'vite.config.ts', 'tsconfig.json', 'index.html', 'scripts/x.sh', '.cursor/hooks.json', '.env', '.env.local',
    'src/storefront', 'src/storefrontX/a.ts', 'src/components-evil/a.ts', 'public', 'node_modules/x/index.js',
    '../src/storefront/a.ts', 'src/storefront/../speedvendors/commerce.ts', '/src/storefront/a.ts',
  ]) {
    it(`not editable: ${no}`, () => assert.equal(isEditablePath(no), false));
  }
});
