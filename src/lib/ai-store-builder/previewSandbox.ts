/**
 * Phase 3 preview iframe sandbox — opaque unique origin for AI-generated srcdoc.
 *
 * Intentionally OMITTED:
 * - allow-same-origin — with allow-scripts this would share the dashboard origin
 *   and let untrusted storefront code read parent DOM/storage/auth. Forbidden.
 * - allow-popups / allow-popups-to-escape-sandbox — not required for draft commerce QA;
 *   checkout stays in-iframe. Phase 4 hosting will use a proper separate origin.
 *
 * Granted:
 * - allow-scripts — React storefront
 * - allow-forms — checkout form fields
 *
 * Transport note: HTML is loaded via srcdoc because Supabase Edge currently serves
 * preview GET bodies as text/plain (+ nosniff), which blocks direct iframe navigation.
 * Phase 4 must serve storefronts as text/html from a dedicated web origin — srcdoc
 * is a Phase 3 workaround only.
 */
export const CURSOR_PREVIEW_IFRAME_SANDBOX = 'allow-scripts allow-forms' as const;

/** Injected after HTML fetch for isolation smoke checks (dev/QA only via data attribute). */
export const PREVIEW_ISOLATION_PROBE_SCRIPT = `<script data-sv-isolation-probe="1">
(function () {
  var report = { parentDocument: 'denied', parentLocalStorage: 'denied', parentSessionStorage: 'denied', topNavigate: 'denied' };
  try {
    void window.parent.document;
    report.parentDocument = 'ACCESSIBLE';
  } catch (e) {
    report.parentDocument = 'denied';
  }
  try {
    void window.parent.localStorage;
    report.parentLocalStorage = 'ACCESSIBLE';
  } catch (e) {
    report.parentLocalStorage = 'denied';
  }
  try {
    void window.parent.sessionStorage;
    report.parentSessionStorage = 'ACCESSIBLE';
  } catch (e) {
    report.parentSessionStorage = 'denied';
  }
  try {
    var desc = Object.getOwnPropertyDescriptor(window.top, 'location');
    // Assignment attempt — must throw or be ignored for sandboxed opaque origin
    window.top.location.href = 'about:blank#sv-isolation-should-fail';
    report.topNavigate = 'ACCESSIBLE';
  } catch (e) {
    report.topNavigate = 'denied';
  }
  window.__SV_PREVIEW_ISOLATION__ = report;
})();
</script>`;

export function injectPreviewIsolationProbe(html: string): string {
  if (html.includes('data-sv-isolation-probe')) return html;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${PREVIEW_ISOLATION_PROBE_SCRIPT}</head>`);
  }
  return PREVIEW_ISOLATION_PROBE_SCRIPT + html;
}
