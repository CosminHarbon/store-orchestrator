/**
 * Phase 5B.2 screenshot capture + bounding-box responsive checks.
 * Writes to docs/ai-studio-v2-layout-grammar-screenshots/5b2/
 *
 *   npx --yes tsx scripts/ai-studio-v2-layout-grammar-screenshots.ts
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANDIDATE_GRAMMARS,
  SEED_STRUCTURE_NOTES,
  seedComparisonMatrix,
  VIEWPORT_WIDTH_PX,
  type GrammarViewport,
} from '../src/lib/ai-studio/v2/layoutGrammar/index.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/ai-studio-v2-layout-grammar-screenshots/5b2');
const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}`;

const CAPTURE_VIEWPORTS: GrammarViewport[] = ['desktop', 'tablet', 'mobile', 'phone'];
const AUDIT_VIEWPORTS: GrammarViewport[] = ['desktop', 'tablet', 'compact', 'mobile', 'phone'];

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(url: string, tries = 80) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok || res.status === 404) return;
    } catch {
      /* retry */
    }
    await wait(500);
  }
  throw new Error(`Dev server did not start at ${url}`);
}

function startVite() {
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, BROWSER: 'none' },
  });
  child.stdout?.on('data', (d) => process.stdout.write(d));
  child.stderr?.on('data', (d) => process.stderr.write(d));
  return child;
}

type AuditIssue = { check: string; detail: string };

/** Plain JS string so tsx/esbuild helpers (__name) are not injected into Playwright. */
const AUDIT_JS = [
  '(() => {',
  "const root = document.querySelector('.lg-root');",
  'const issues = [];',
  "if (!root) return [{ check: 'root', detail: 'missing .lg-root' }];",
  'const rootBox = root.getBoundingClientRect();',
  "if (root.scrollWidth > root.clientWidth + 3) issues.push({ check: 'overflow', detail: 'scrollWidth ' + root.scrollWidth + ' > clientWidth ' + root.clientWidth });",
  "const railSel = '.lg-cin-sequence, .lg-mon-rail, .lg-ed-cluster, .lg-nav-drawer, .lg-cat-chips';",
  'function clippedByHidden(el, label) {',
  '  const er = el.getBoundingClientRect();',
  "  if (er.width < 2 || er.height < 8) { issues.push({ check: 'clipped', detail: label + ' has empty box' }); return; }",
  '  if (el.closest(railSel)) return;',
  '  const rightLimit = rootBox.left + root.clientWidth;',
  "  if (er.left < rootBox.left - 4 || er.right > rightLimit + 4) issues.push({ check: 'clipped', detail: label + ' horizontally outside root' });",
  '  let node = el.parentElement;',
  '  while (node && node !== root) {',
  '    const style = getComputedStyle(node);',
  "    const hiddenX = style.overflowX === 'hidden' || style.overflowX === 'clip';",
  "    const hiddenY = style.overflowY === 'hidden' || style.overflowY === 'clip';",
  '    if (hiddenX || hiddenY) {',
  '      const pr = node.getBoundingClientRect();',
  '      if (hiddenX) {',
  '        const vis = Math.min(er.right, pr.right) - Math.max(er.left, pr.left);',
  "        if (vis < er.width * 0.82) { issues.push({ check: 'clipped', detail: label + ' cut horizontally' }); break; }",
  '      }',
  "      if (hiddenY && !node.classList.contains('lg-root')) {",
  '        const vis = Math.min(er.bottom, pr.bottom) - Math.max(er.top, pr.top);',
  "        if (vis < er.height * 0.82 && vis < 12) { issues.push({ check: 'clipped', detail: label + ' cut vertically' }); break; }",
  '      }',
  '    }',
  '    node = node.parentElement;',
  '  }',
  '}',
  'function requireEl(sel, label) {',
  '  const el = root.querySelector(sel);',
  "  if (!el) { issues.push({ check: 'missing', detail: label }); return null; }",
  '  clippedByHidden(el, label);',
  '  return el;',
  '}',
  "requireEl('h1', 'primary heading');",
  "requireEl('.lg-product-price, .lg-mon-price, [data-role=\"price\"]', 'price');",
  "requireEl('.lg-cta-solid, .lg-cta', 'primary CTA');",
  "requireEl('.lg-cart', 'cart control');",
  "requireEl('.lg-brand', 'brand');",
  "requireEl('.lg-footer', 'footer');",
  "if (root.getAttribute('data-grammar') === 'product_monument') {",
  "  requireEl('.lg-mon-identity h1', 'monument title');",
  "  requireEl('.lg-mon-price', 'monument price');",
  "  requireEl('.lg-mon-actions .lg-cta-solid', 'monument add to cart');",
  "  const identity = root.querySelector('.lg-mon-identity');",
  "  if (identity && identity.getBoundingClientRect().height < 80) issues.push({ check: 'clipped', detail: 'monument identity too short' });",
  '}',
  "root.querySelectorAll('.lg-product-name').forEach(function(el, i) { clippedByHidden(el, 'product title[' + i + ']'); });",
  "const brand = root.querySelector('.lg-brand');",
  "const cart = root.querySelector('.lg-cart');",
  'if (brand && cart) {',
  '  const a = brand.getBoundingClientRect();',
  '  const b = cart.getBoundingClientRect();',
  '  const overlap = !(a.right < b.left + 2 || b.right < a.left + 2 || a.bottom < b.top + 2 || b.bottom < a.top + 2);',
  "  if (overlap) issues.push({ check: 'nav-overlap', detail: 'brand overlaps cart' });",
  '}',
  'if (cart) {',
  '  const cartBox = cart.getBoundingClientRect();',
  "  if (cartBox.width < 40 || cartBox.height < 40) issues.push({ check: 'cart', detail: 'cart hit target too small' });",
  '}',
  "root.querySelectorAll('h1, .lg-type-display, .lg-product-name').forEach(function(node) {",
  "  if (node.scrollWidth > node.clientWidth + 6 && getComputedStyle(node).overflowX === 'hidden') {",
  "    issues.push({ check: 'text-overflow', detail: 'text exceeds box' });",
  '  }',
  '});',
  "const overlayCopy = root.querySelector('.lg-cin-copy, .lg-ty-poster-band, .lg-nav-overlay');",
  'if (overlayCopy) {',
  '  const color = getComputedStyle(overlayCopy).color;',
  '  const bg = getComputedStyle(overlayCopy).backgroundColor;',
  '  function parse(c) { const m = c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; }',
  '  const fg = parse(color);',
  '  const back = parse(bg);',
  '  if (fg && back && back[0] + back[1] + back[2] > 8) {',
  '    function L(rgb) { return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255; }',
  '    const ratio = (Math.max(L(fg), L(back)) + 0.05) / (Math.min(L(fg), L(back)) + 0.05);',
  "    if (ratio < 3) issues.push({ check: 'contrast', detail: 'overlay contrast ' + ratio.toFixed(2) });",
  '  }',
  '}',
  "root.querySelectorAll('section').forEach(function(section, i) {",
  '  const r = section.getBoundingClientRect();',
  "  const media = section.querySelector('.lg-media, img');",
  "  const text = (section.textContent || '').replace(/\\s+/g, ' ').trim();",
  '  if (!media && r.height > window.innerHeight * 1.15 && text.length < 80) {',
  "    issues.push({ check: 'empty-height', detail: 'section[' + i + '] ' + Math.round(r.height) + 'px' });",
  '  }',
  '});',
  'return issues;',
  '})()',
].join('\n');

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(resolve(OUT, 'neutral'), { recursive: true });
  mkdirSync(resolve(OUT, 'niche'), { recursive: true });
  mkdirSync(resolve(OUT, 'variation'), { recursive: true });

  let vite = startVite();
  await waitForServer(`${BASE}/ai-studio-v2-layout-grammars`);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
  });

  const failures: string[] = [];
  const shots: string[] = [];
  const auditLog: Array<{ shot: string; issues: AuditIssue[] }> = [];

  async function capture(opts: {
    grammar: string;
    branding: 'neutral' | 'niche';
    seed: string;
    viewport: GrammarViewport;
    folder: string;
    audit: boolean;
  }) {
    const width = VIEWPORT_WIDTH_PX[opts.viewport];
    const height = opts.viewport === 'desktop' || opts.viewport === 'tablet' ? 1100 : 844;
    const page = await browser.newPage({ viewport: { width: width + 24, height } });
    const url = `${BASE}/ai-studio-v2-layout-grammars?mode=single&capture=1&grammar=${opts.grammar}&branding=${opts.branding}&seed=${opts.seed}&viewport=${opts.viewport}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.lg-root', { timeout: 20000 });
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(document.images).map(
          (img) =>
            img.complete ||
            new Promise((resolve) => {
              img.onload = () => resolve(true);
              img.onerror = () => resolve(true);
            })
        )
      );
      document.fonts && (await document.fonts.ready);
    });
    await wait(500);

    if (opts.audit) {
      const issues = (await page.evaluate(AUDIT_JS)) as AuditIssue[];
      auditLog.push({
        shot: `${opts.grammar} ${opts.branding} ${opts.seed} ${opts.viewport}`,
        issues,
      });
      for (const issue of issues) {
        failures.push(`${opts.grammar} ${opts.seed} ${opts.viewport}: ${issue.check} — ${issue.detail}`);
      }
    }

    const file = `${opts.grammar}__${opts.branding}__${opts.seed}__${opts.viewport}.png`;
    const path = resolve(OUT, opts.folder, file);
    const el = page.locator('.lg-capture').first();
    await el.screenshot({ path, timeout: 30000 });
    shots.push(path);
    await page.close();
    console.log('shot', file);
  }

  for (const grammar of CANDIDATE_GRAMMARS) {
    for (const viewport of CAPTURE_VIEWPORTS) {
      await capture({
        grammar,
        branding: 'neutral',
        seed: 'seed-a',
        viewport,
        folder: 'neutral',
        audit: true,
      });
    }
    await capture({
      grammar,
      branding: 'neutral',
      seed: 'seed-b',
      viewport: 'desktop',
      folder: 'variation',
      audit: true,
    });
    await capture({
      grammar,
      branding: 'neutral',
      seed: 'seed-b',
      viewport: 'mobile',
      folder: 'variation',
      audit: true,
    });
    await capture({
      grammar,
      branding: 'niche',
      seed: 'seed-a',
      viewport: 'desktop',
      folder: 'niche',
      audit: false,
    });
    await capture({
      grammar,
      branding: 'niche',
      seed: 'seed-a',
      viewport: 'mobile',
      folder: 'niche',
      audit: false,
    });
    await capture({
      grammar,
      branding: 'neutral',
      seed: 'seed-a',
      viewport: 'compact',
      folder: 'neutral',
      audit: true,
    });
  }

  const interactPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await interactPage.goto(
    `${BASE}/ai-studio-v2-layout-grammars?mode=single&capture=1&grammar=product_monument&branding=neutral&seed=seed-a&viewport=desktop`,
    { waitUntil: 'domcontentloaded', timeout: 60000 }
  );
  await interactPage.waitForSelector('.lg-mon-actions .lg-cta-solid', { timeout: 20000 });
  await interactPage.click('.lg-mon-actions .lg-cta-solid');
  await interactPage.waitForSelector('.lg-cart-sheet', { timeout: 5000 });
  const cartOpen = await interactPage.locator('.lg-cart-sheet').isVisible();
  const badge = await interactPage.locator('.lg-cart-badge').first().innerText();
  if (!cartOpen || badge.trim() === '0') {
    failures.push(`interaction: add-to-cart did not open cart (badge=${badge})`);
  }
  await interactPage.click('.lg-cart-sheet .lg-cta');
  await interactPage.click('.lg-product-name, .lg-mon-identity h1');
  const view = await interactPage.evaluate(() => document.querySelector('.lg-root')?.getAttribute('data-grammar'));
  if (view !== 'product_monument') failures.push('interaction: grammar unmounted after product click');
  await interactPage.close();

  const matrix = CANDIDATE_GRAMMARS.map((id) => ({
    grammar: id,
    notes: SEED_STRUCTURE_NOTES[id],
    axes: seedComparisonMatrix(id),
  }));
  writeFileSync(resolve(OUT, 'seed-comparison-matrix.json'), JSON.stringify(matrix, null, 2));
  writeFileSync(resolve(OUT, 'bbox-audit.json'), JSON.stringify(auditLog, null, 2));

  const index = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>5B.2 Layout grammar contact sheet</title>
<style>
  html,body{min-width:1680px;margin:0;background:#111;color:#eee;font:15px/1.45 ui-sans-serif,system-ui}
  main{padding:32px 40px 80px;max-width:none}
  h1{font-size:28px;margin:0 0 8px}
  h2{font-size:18px;margin:40px 0 12px;letter-spacing:.06em;text-transform:uppercase}
  p{opacity:.75;max-width:90ch}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(720px,1fr));gap:28px;margin:0 0 40px}
  figure{margin:0;background:#1a1a1a;padding:12px}
  img{width:100%;height:auto;display:block;image-rendering:auto}
  figcaption{font-size:13px;margin-top:8px;opacity:.8}
  a{color:#9ad7b2}
</style></head><body><main>
<h1>AI Studio V2 — Phase 5B.2 candidates (full-resolution)</h1>
<p>Images are the original captures (1440 / 1024 / 390 / 360). This page is at least 1680px wide and links to the PNG files directly — it is not a 269px thumbnail sheet.</p>
${CANDIDATE_GRAMMARS.map((g) => {
  const nDesk = `neutral/${g}__neutral__seed-a__desktop.png`;
  const nTab = `neutral/${g}__neutral__seed-a__tablet.png`;
  const nMob = `neutral/${g}__neutral__seed-a__mobile.png`;
  const nPhone = `neutral/${g}__neutral__seed-a__phone.png`;
  const varB = `variation/${g}__neutral__seed-b__desktop.png`;
  const varBm = `variation/${g}__neutral__seed-b__mobile.png`;
  return `<h2>${g}</h2>
  <p>${SEED_STRUCTURE_NOTES[g].seedA} · ${SEED_STRUCTURE_NOTES[g].seedB}</p>
  <div class="grid">
    <figure><a href="${nDesk}"><img src="${nDesk}" alt="${g} desktop seed-a"/></a><figcaption>neutral · seed-a · desktop 1440 — <a href="${nDesk}">open original</a></figcaption></figure>
    <figure><a href="${varB}"><img src="${varB}" alt="${g} desktop seed-b"/></a><figcaption>neutral · seed-b · desktop 1440 — <a href="${varB}">open original</a></figcaption></figure>
    <figure><a href="${nTab}"><img src="${nTab}" alt="${g} tablet"/></a><figcaption>neutral · seed-a · tablet 1024 — <a href="${nTab}">open original</a></figcaption></figure>
    <figure><a href="${nMob}"><img src="${nMob}" alt="${g} mobile"/></a><figcaption>neutral · seed-a · mobile 390 — <a href="${nMob}">open original</a></figcaption></figure>
    <figure><a href="${nPhone}"><img src="${nPhone}" alt="${g} phone"/></a><figcaption>neutral · seed-a · phone 360 — <a href="${nPhone}">open original</a></figcaption></figure>
    <figure><a href="${varBm}"><img src="${varBm}" alt="${g} seed-b mobile"/></a><figcaption>neutral · seed-b · mobile 390 — <a href="${varBm}">open original</a></figcaption></figure>
  </div>`;
}).join('')}
</main></body></html>`;
  writeFileSync(resolve(OUT, 'index.html'), index, 'utf8');

  const sheetHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>5B.2 contact sheet 1600+</title>
<style>
  html,body{margin:0;background:#0e0e10;min-width:1680px}
  .sheet{display:grid;grid-template-columns:repeat(2,minmax(820px,1fr));gap:16px;padding:20px;width:1680px;box-sizing:border-box}
  img{width:820px;height:auto;display:block;background:#000}
  p{color:#ddd;font:13px/1.3 ui-sans-serif;margin:0 0 8px;padding:0 20px}
</style></head><body>
<p>Full-resolution desktop seed-a contact sheet — 1680px wide, images are original 1440 captures.</p>
<div class="sheet">
${CANDIDATE_GRAMMARS.map((g) => `<img src="neutral/${g}__neutral__seed-a__desktop.png" alt="${g}"/>`).join('')}
</div>
</body></html>`;
  writeFileSync(resolve(OUT, 'contact-sheet.html'), sheetHtml, 'utf8');

  const sheetPage = await browser.newPage({ viewport: { width: 1720, height: 2200 } });
  await sheetPage.goto(`file://${resolve(OUT, 'contact-sheet.html')}`, { waitUntil: 'load', timeout: 60000 });
  await wait(800);
  const sheetPng = resolve(OUT, 'contact-sheet-candidates-desktop.png');
  await sheetPage.screenshot({ path: sheetPng, fullPage: true });
  shots.push(sheetPng);
  await sheetPage.close();

  await browser.close();
  vite.kill('SIGTERM');

  writeFileSync(
    resolve(OUT, 'report.json'),
    JSON.stringify({ shots: shots.length, failures, auditedViewports: AUDIT_VIEWPORTS }, null, 2)
  );

  if (failures.length) {
    console.error('VALIDATION FAILURES');
    for (const f of failures) console.error(' -', f);
    process.exit(1);
  }
  console.log(`captured ${shots.length} screenshots → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
