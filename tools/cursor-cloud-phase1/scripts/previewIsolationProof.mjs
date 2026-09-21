import pkg from 'playwright';
const { chromium } = pkg;
import assert from 'node:assert/strict';

const SANDBOX = 'allow-scripts allow-forms';
const PARENT_MARKER = 'sv-dashboard-secret-should-never-leak';

const PROBE = `<script data-sv-isolation-probe="1">
(function () {
  var report = {
    parentDocument: 'denied',
    parentLocalStorage: 'denied',
    parentSessionStorage: 'denied',
    topNavigate: 'denied',
    parentCookies: 'denied',
    parentSecretProp: 'denied'
  };
  try { void window.parent.document; report.parentDocument = 'ACCESSIBLE'; } catch (e) { report.parentDocument = 'denied:' + (e && e.name); }
  try { void window.parent.localStorage; report.parentLocalStorage = 'ACCESSIBLE'; } catch (e) { report.parentLocalStorage = 'denied:' + (e && e.name); }
  try { void window.parent.sessionStorage; report.parentSessionStorage = 'ACCESSIBLE'; } catch (e) { report.parentSessionStorage = 'denied:' + (e && e.name); }
  try { void window.parent.document.cookie; report.parentCookies = 'ACCESSIBLE'; } catch (e) { report.parentCookies = 'denied:' + (e && e.name); }
  try { void window.parent.__SV_DASH_SECRET__; report.parentSecretProp = 'ACCESSIBLE'; } catch (e) { report.parentSecretProp = 'denied:' + (e && e.name); }
  try { window.top.location.href = 'about:blank#sv-isolation-should-fail'; report.topNavigate = 'ACCESSIBLE'; } catch (e) { report.topNavigate = 'denied:' + (e && e.name); }
  try { window.parent.postMessage({ type: 'sv-isolation-report', report: report }, '*'); } catch (e) {}
})();
</script>`;

async function main() {
  assert.ok(!SANDBOX.includes('allow-same-origin'));

  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage();
  // Real http origin so parent localStorage/sessionStorage behave like the dashboard.
  await page.goto('https://example.com');
  await page.setContent(`<!doctype html>
<html><body>
  <div id="dash">SpeedVendors dashboard</div>
  <iframe id="preview" title="probe" sandbox="${SANDBOX}" referrerpolicy="no-referrer"></iframe>
  <script>
    window.__SV_ISOLATION_REPORTS__ = [];
    window.addEventListener('message', function (ev) {
      if (ev && ev.data && ev.data.type === 'sv-isolation-report') {
        window.__SV_ISOLATION_REPORTS__.push(ev.data.report);
      }
    });
    localStorage.setItem('${PARENT_MARKER}', 'secret');
    sessionStorage.setItem('${PARENT_MARKER}', 'secret');
    document.cookie = '${PARENT_MARKER}=auth-token-fake; path=/';
    window.__SV_DASH_SECRET__ = 'secret';
  </script>
</body></html>`);

  const attackHtml = `<!doctype html><html><head>${PROBE}</head><body><p>untrusted storefront</p></body></html>`;
  await page.locator('#preview').evaluate((el, html) => { el.srcdoc = html; }, attackHtml);
  await page.waitForFunction(() => (window.__SV_ISOLATION_REPORTS__ || []).length > 0, null, { timeout: 5000 });

  const result = await page.evaluate((marker) => {
    const report = window.__SV_ISOLATION_REPORTS__[0];
    let parentReadIframe = 'denied';
    try {
      const w = document.getElementById('preview').contentWindow;
      void w.document;
      parentReadIframe = 'ACCESSIBLE';
    } catch (e) {
      parentReadIframe = 'denied:' + (e && e.name);
    }
    return {
      isolation: report,
      parentReadIframe,
      parentStillHasSecret: localStorage.getItem(marker),
      parentUrl: location.href,
      sandboxAttr: document.getElementById('preview').getAttribute('sandbox'),
    };
  }, PARENT_MARKER);

  console.log(JSON.stringify(result, null, 2));
  const denied = (v) => typeof v === 'string' && v.startsWith('denied');
  assert.ok(result.isolation);
  for (const k of ['parentDocument','parentLocalStorage','parentSessionStorage','parentCookies','parentSecretProp','topNavigate']) {
    assert.ok(denied(result.isolation[k]), `${k}=${result.isolation[k]}`);
  }
  assert.ok(denied(result.parentReadIframe), result.parentReadIframe);
  assert.equal(result.parentStillHasSecret, 'secret');
  assert.ok(!String(result.parentUrl).includes('sv-isolation-should-fail'));
  assert.equal(result.sandboxAttr, SANDBOX);
  await browser.close();
  console.log('PASS preview isolation');
}
main().catch((e) => { console.error(e); process.exit(1); });
