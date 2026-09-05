/**
 * Phase 5C.1 design-intelligence inspector screenshots + overflow checks.
 * Writes to docs/ai-studio-v2-design-intelligence-screenshots/
 *
 *   npx --yes tsx scripts/ai-studio-v2-design-intelligence-screenshots.ts
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INTELLIGENCE_FIXTURE_IDS } from '../src/lib/ai-studio/v2/designIntelligence/fixtures.ts';
import { VIEWPORT_WIDTH_PX, type GrammarViewport } from '../src/lib/ai-studio/v2/layoutGrammar/types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/ai-studio-v2-design-intelligence-screenshots');
const PORT = 4180;
const BASE = `http://127.0.0.1:${PORT}`;

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

const AUDIT_JS = [
  '(() => {',
  "const root = document.querySelector('.lg-root');",
  'const issues = [];',
  "if (!root) return [{ check: 'root', detail: 'missing .lg-root' }];",
  'const rootBox = root.getBoundingClientRect();',
  "if (root.scrollWidth > root.clientWidth + 3) issues.push({ check: 'overflow', detail: 'scrollWidth ' + root.scrollWidth + ' > clientWidth ' + root.clientWidth });",
  'return issues;',
  '})()',
].join('\n');

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(resolve(OUT, 'inspector'), { recursive: true });
  mkdirSync(resolve(OUT, 'naive'), { recursive: true });
  mkdirSync(resolve(OUT, 'intelligent'), { recursive: true });
  mkdirSync(resolve(OUT, 'compare'), { recursive: true });

  const vite = startVite();
  await waitForServer(`${BASE}/ai-studio-v2-design-intelligence`);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  const failures: string[] = [];
  const shots: string[] = [];
  const auditLog: Array<{ shot: string; issues: Array<{ check: string; detail: string }> }> = [];

  async function ready(page: import('playwright').Page) {
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(document.images).map(
          (img) =>
            img.complete ||
            new Promise((resolveImg) => {
              img.onload = () => resolveImg(true);
              img.onerror = () => resolveImg(true);
            })
        )
      );
      document.fonts && (await document.fonts.ready);
    });
    await wait(400);
  }

  async function shot(page: import('playwright').Page, selector: string, file: string) {
    const path = resolve(OUT, file);
    if (existsSync(path)) {
      console.log('skip', file);
      shots.push(path);
      return;
    }
    const el = page.locator(selector).first();
    const jpeg = file.endsWith('.jpg');
    await el.screenshot({ path, timeout: 30000, type: jpeg ? 'jpeg' : 'png', quality: jpeg ? 52 : undefined });
    shots.push(path);
    console.log('shot', file);
  }

  for (const id of INTELLIGENCE_FIXTURE_IDS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
    await page.goto(
      `${BASE}/ai-studio-v2-design-intelligence?fixture=${id}&pane=inspector&capture=1`,
      { waitUntil: 'domcontentloaded', timeout: 60000 }
    );
    await page.waitForSelector('[data-inspector="1"]', { timeout: 20000 });
    await ready(page);
    const inspectorPath = resolve(OUT, `inspector/${id}__inspector.jpg`);
    await page.locator('[data-inspector="1"]').first().screenshot({ path: inspectorPath, timeout: 30000, type: 'jpeg', quality: 55 });
    shots.push(inspectorPath);
    console.log('shot', `inspector/${id}__inspector.jpg`);
    await page.close();
  }

  const previewCases: Array<{ fixture: string; assignment: 'naive' | 'intelligent'; viewport: GrammarViewport }> = [
    { fixture: 'headphones_technology', assignment: 'naive', viewport: 'desktop' },
    { fixture: 'headphones_technology', assignment: 'intelligent', viewport: 'desktop' },
    { fixture: 'headphones_technology', assignment: 'naive', viewport: 'mobile' },
    { fixture: 'headphones_technology', assignment: 'intelligent', viewport: 'mobile' },
    { fixture: 'luxury_handbags', assignment: 'intelligent', viewport: 'desktop' },
    { fixture: 'streetwear', assignment: 'intelligent', viewport: 'desktop' },
    { fixture: 'skincare_beauty', assignment: 'intelligent', viewport: 'desktop' },
    { fixture: 'packshots_only', assignment: 'intelligent', viewport: 'desktop' },
    { fixture: 'sparse_single_product', assignment: 'intelligent', viewport: 'desktop' },
    { fixture: 'insufficient_metadata', assignment: 'intelligent', viewport: 'desktop' },
    { fixture: 'forma_audio_showcase', assignment: 'naive', viewport: 'desktop' },
    { fixture: 'forma_audio_showcase', assignment: 'intelligent', viewport: 'desktop' },
  ];

  for (const opts of previewCases) {
    const file = `${opts.assignment}/${opts.fixture}__${opts.assignment}__${opts.viewport}.jpg`;
    const png = `${opts.assignment}/${opts.fixture}__${opts.assignment}__${opts.viewport}.png`;
    if (existsSync(resolve(OUT, file)) || existsSync(resolve(OUT, png))) {
      console.log('skip', png, 'or', file);
      shots.push(existsSync(resolve(OUT, png)) ? resolve(OUT, png) : resolve(OUT, file));
      continue;
    }
    const width = VIEWPORT_WIDTH_PX[opts.viewport];
    const height = opts.viewport === 'desktop' ? 1100 : 844;
    const page = await browser.newPage({ viewport: { width: width + 24, height } });
    const url = `${BASE}/ai-studio-v2-design-intelligence?fixture=${opts.fixture}&assignment=${opts.assignment}&viewport=${opts.viewport}&pane=${opts.assignment}&capture=1`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.lg-root, [data-fallback-preview="1"]', { timeout: 20000 });
    await ready(page);
    const fallback = await page.$('[data-fallback-preview="1"]');
    if (!fallback) {
      const issues = (await page.evaluate(AUDIT_JS)) as Array<{ check: string; detail: string }>;
      auditLog.push({ shot: `${opts.fixture} ${opts.assignment} ${opts.viewport}`, issues });
      for (const issue of issues) {
        failures.push(`${opts.fixture} ${opts.assignment} ${opts.viewport}: ${issue.check} — ${issue.detail}`);
      }
    } else {
      auditLog.push({ shot: `${opts.fixture} ${opts.assignment} ${opts.viewport}`, issues: [{ check: 'fallback', detail: 'no grammar selected' }] });
    }
    if (opts.assignment === 'intelligent' && opts.fixture === 'headphones_technology') {
      const titles = await page.locator('.lg-mon-spec h2').allTextContents();
      if (titles.some((t) => /^use$/i.test(t.trim()))) {
        failures.push('headphones intelligent preview still renders Use');
      }
      if (titles.some((t) => /^form$/i.test(t.trim()) || /^make$/i.test(t.trim()))) {
        failures.push(`headphones intelligent preview still renders Form/Make (${titles.join(',')})`);
      }
    }
    if (opts.assignment === 'naive' && opts.fixture === 'headphones_technology' && opts.viewport === 'desktop') {
      const titles = await page.locator('.lg-mon-spec h2').allTextContents();
      if (!titles.some((t) => /^use$/i.test(t.trim()))) {
        failures.push('headphones naive preview lost Use (needed for before/after)');
      }
    }
    await shot(page, '.lg-capture', `${opts.assignment}/${opts.fixture}__${opts.assignment}__${opts.viewport}.jpg`);
    await page.close();
  }

  const compare = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  await compare.goto(
    `${BASE}/ai-studio-v2-design-intelligence?fixture=headphones_technology&assignment=compare&viewport=desktop`,
    { waitUntil: 'domcontentloaded', timeout: 60000 }
  );
  await compare.waitForSelector('.lg-root', { timeout: 20000 });
  await ready(compare);
  const comparePath = resolve(OUT, 'compare/headphones_technology__compare__desktop.jpg');
  if (!existsSync(comparePath)) {
    await compare.screenshot({ path: comparePath, fullPage: true, type: 'jpeg', quality: 52 });
    shots.push(comparePath);
    console.log('shot compare/headphones_technology__compare__desktop.jpg');
  }
  await compare.close();

  const index = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>5C.1 Design intelligence</title>
<style>
  html,body{margin:0;background:#111;color:#eee;font:15px/1.45 ui-sans-serif,system-ui}
  main{padding:32px 40px 80px}
  h1{font-size:28px;margin:0 0 8px}
  h2{font-size:18px;margin:32px 0 12px}
  p{opacity:.75;max-width:90ch}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(520px,1fr));gap:20px}
  figure{margin:0;background:#1a1a1a;padding:12px}
  img{width:100%;height:auto;display:block}
  a{color:#9ad7b2}
</style></head><body><main>
<h1>AI Studio V2 — Phase 5C.1 design intelligence</h1>
<p>Before/after for the technology niche: naive Form/Make/Use vs ownership-safe Product Monument.</p>
<h2>Headphones — naive vs intelligence</h2>
<div class="grid">
  <figure><a href="naive/headphones_technology__naive__desktop.png"><img src="naive/headphones_technology__naive__desktop.png" alt="naive desktop"/></a><figcaption>Naive 5B.2 Form/Make/Use</figcaption></figure>
  <figure><a href="intelligent/headphones_technology__intelligent__desktop.png"><img src="intelligent/headphones_technology__intelligent__desktop.png" alt="intelligent desktop"/></a><figcaption>Design-intelligence assignment</figcaption></figure>
</div>
<h2>Forma Audio showcase catalog</h2>
<div class="grid">
  <figure><a href="naive/forma_audio_showcase__naive__desktop.jpg"><img src="naive/forma_audio_showcase__naive__desktop.jpg" alt="forma naive"/></a><figcaption>Showcase naive</figcaption></figure>
  <figure><a href="intelligent/forma_audio_showcase__intelligent__desktop.jpg"><img src="intelligent/forma_audio_showcase__intelligent__desktop.jpg" alt="forma intelligent"/></a><figcaption>Showcase intelligence</figcaption></figure>
</div>
</main></body></html>`;
  writeFileSync(resolve(OUT, 'index.html'), index, 'utf8');

  await browser.close();
  vite.kill('SIGTERM');

  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify({ shots: shots.length, failures, auditLog }, null, 2));

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
