/**
 * Preview iframe sandbox + srcdoc isolation unit tests (no browser required).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CURSOR_PREVIEW_IFRAME_SANDBOX,
  injectPreviewIsolationProbe,
} from '../../../src/lib/ai-store-builder/previewSandbox.ts';

describe('previewSandbox', () => {
  it('never pairs allow-scripts with allow-same-origin', () => {
    const tokens = CURSOR_PREVIEW_IFRAME_SANDBOX.split(/\s+/);
    assert.ok(tokens.includes('allow-scripts'));
    assert.ok(tokens.includes('allow-forms'));
    assert.ok(!tokens.includes('allow-same-origin'));
    assert.ok(!tokens.includes('allow-popups'));
    assert.ok(!tokens.includes('allow-popups-to-escape-sandbox'));
  });

  it('injects isolation probe once into HTML head', () => {
    const html = '<!doctype html><html><head><title>t</title></head><body></body></html>';
    const once = injectPreviewIsolationProbe(html);
    assert.ok(once.includes('data-sv-isolation-probe'));
    assert.ok(once.includes('__SV_PREVIEW_ISOLATION__'));
    const twice = injectPreviewIsolationProbe(once);
    assert.equal(
      twice.split('data-sv-isolation-probe').length - 1,
      1,
      'probe should not duplicate',
    );
  });
});
