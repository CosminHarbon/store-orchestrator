/**
 * Playwright proof: srcdoc + restrictive sandbox cannot access parent dashboard state.
 *
 *   cd /tmp && npm i playwright@1.63.0
 *   node /path/to/previewIsolationProof.mjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

/** Must match src/lib/ai-store-builder/previewSandbox.ts */
const SANDBOX = 'allow-scripts allow-forms';
const PARENT_MARKER = 'sv-dashboard-secret-should-never-leak';

const PROBE = `<script data-sv-isolation-probe="1">
(function () {
  var report = { parentDocument: 'denied', parentLocalStorage: 'denied', parentSessionStorage: 'denied', topNavigate: 'denied' };
  try { void window.parent.document; report.parentDocument = 'ACCESSIBLE'; } catch (e) { report.parentDocument = 'denied'; }
  try { void window.parent.localStorage; report.parentLocalStorage = 'ACCESSIBLE'; } catch (e) { report.parentLocalStorage = 'denied'; }
  try { void window.parent.sessionStorage; report.parentSessionStorage = 'ACCESSIBLE'; } catch (e) { report.parentSessionStorage = 'denied'; }
  try { window.top.location.href = 'about:blank#sv-isolation-should-fail'; report.topNavigate = 'ACCESSIBLE'; } catch (e) { report.topNavigate = 'denied'; }
  window.__SV_PREVIEW_ISOLATION__ = report;
  window.__SV_EXTRA__ = {};
  try { window.__SV_EXTRA__.parentLocal = window.parent.localStorage.getItem('${PARENT_MARKER}'); } catch (e) { window.__SV_EXTRA__.parentLocal = 'THREW'; }
  try { window.__SV_EXTRA__.parentSecret = window.parent.__SV_DASH_SECRET__; } catch (e) { window.__SV_EXTRA__.parentSecret = 'THREW'; }
  try { window.__SV_EXTRA__.parentDoc = !!window.parent.document.getElementById('dash'); } catch (e) { window.__SV_EXTRA__.parentDoc = 'THREW'; }
})();
</script>`;

async function main() {
  assert.ok(!SANDBOX.includes('allow-same-origin'));

  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const page = await browser.newPage();
  await page.setContent(`<!doctype html>
<html><body>
  <div id="dash">SpeedVendors dashboard</div>
  <iframe id="preview" title="probe" sandbox="${SANDBOX}"></iframe>
  <script>
    localStorage.setItem('${PARENT_MARKER}', 'secret');
    sessionStorage.setItem('${PARENT_MARKER}', 'secret');
    window.__SV_DASH_SECRET__ = 'secret';
  </script>
</body></html>`);

  const attackHtml = `<!doctype html><html><head>${PROBE}</head><body><p>storefront</p></body></html>`;
  await page.locator('#preview').evaluate((el, html) => {
    el.srcdoc = html;
  }, attackHtml);
  await page.waitForTimeout(1000);

  const report = await page.evaluate((marker) => {
    const iframe = document.getElementById('preview');
    const w = iframe.contentWindow;
    return {
      isolation: w && w.__SV_PREVIEW_ISOLATION__ ? w.__SV_PREVIEW_ISOLATION__ : null,
      extra: w && w.__SV_EXTRA__ ? w.__SV_EXTRA__ : null,
      parentStillHasSecret: localStorage.getItem(marker),
      parentUrl: location.href,
      sandboxAttr: iframe.getAttribute('sandbox'),
    };
  }, PARENT_MARKER);

  console.log(JSON.stringify(report, null, 2));

  assert.ok(report.isolation, 'isolation probe missing — sandbox may have blocked scripts entirely');
  assert.equal(report.isolation.parentDocument, 'denied');
  assert.equal(report.isolation.parentLocalStorage, 'denied');
  assert.equal(report.isolation.parentSessionStorage, 'denied');
  assert.equal(report.isolation.topNavigate, 'denied');
  assert.equal(report.extra.parentLocal, 'THREW');
  assert.equal(report.extra.parentSecret, 'THREW');
  assert.equal(report.extra.parentDoc, 'THREW');
  assert.equal(report.parentStillHasSecret, 'secret');
  assert.ok(!String(report.parentUrl).includes('sv-isolation-should-fail'));
  assert.equal(report.sandboxAttr, SANDBOX);

  await browser.close();
  console.log('PASS preview isolation');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
