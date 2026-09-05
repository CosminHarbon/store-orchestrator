/**
 * Capture grammar prototypes at 1440 / 390.
 * Run after `npx vite --port 4179` or let this script start Vite.
 *
 *   npx --yes tsx scripts/ai-studio-v2-layout-grammar-screenshots.ts
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/ai-studio-v2-layout-grammar-screenshots');
const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}`;

const GRAMMARS = [
  'editorial_asymmetric',
  'cinematic_full_bleed',
  'product_monument',
  'typographic_campaign',
  'immersive_catalog',
  'warm_storytelling',
] as const;

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(url: string, tries = 60) {
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
  const overflowFailures: string[] = [];
  const shots: string[] = [];

  async function capture(opts: {
    grammar: string;
    branding: 'neutral' | 'niche';
    seed: string;
    viewport: 'desktop' | 'mobile';
    folder: string;
  }) {
    const width = opts.viewport === 'desktop' ? 1440 : 390;
    const height = opts.viewport === 'desktop' ? 1100 : 844;
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
    });
    await wait(400);
    const overflow = await page.evaluate(() => {
      const root = document.querySelector('.lg-root') as HTMLElement | null;
      if (!root) return { bad: true, sw: 0, cw: 0 };
      return { bad: root.scrollWidth > root.clientWidth + 2, sw: root.scrollWidth, cw: root.clientWidth };
    });
    if (overflow.bad) {
      overflowFailures.push(`${opts.grammar} ${opts.branding} ${opts.seed} ${opts.viewport} (${overflow.sw}>${overflow.cw})`);
    }
    const file = `${opts.grammar}__${opts.branding}__${opts.seed}__${opts.viewport}.png`;
    const path = resolve(OUT, opts.folder, file);
    const el = page.locator('.lg-capture').first();
    await el.screenshot({ path, timeout: 30000 });
    shots.push(path);
    await page.close();
    console.log('shot', file);
  }

  for (const grammar of GRAMMARS) {
    for (const branding of ['neutral', 'niche'] as const) {
      for (const viewport of ['desktop', 'mobile'] as const) {
        await capture({ grammar, branding, seed: 'seed-a', viewport, folder: branding });
      }
    }
    await capture({
      grammar,
      branding: 'neutral',
      seed: 'seed-b',
      viewport: 'desktop',
      folder: 'variation',
    });
  }

  const sheetPage = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await sheetPage.goto(`${BASE}/ai-studio-v2-layout-grammars?mode=sheet&capture=1&branding=neutral`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await sheetPage.waitForSelector('.lg-root', { timeout: 30000 });
  await wait(1500);
  const sheetPath = resolve(OUT, 'contact-sheet-neutral-seed-a-b.png');
  await sheetPage.screenshot({ path: sheetPath, fullPage: true });
  shots.push(sheetPath);
  await sheetPage.close();

  await browser.close();
  vite.kill('SIGTERM');

  const index = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>Layout grammar contact sheet</title>
<style>
  body{font:14px/1.4 ui-sans-serif,system-ui;background:#111;color:#eee;margin:24px}
  h1{font-size:20px} h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.6}
  .row{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:28px}
  figure{margin:0;background:#1c1c1c;padding:8px}
  img{width:100%;height:auto;display:block}
  figcaption{font-size:11px;margin-top:6px;opacity:.75}
</style></head><body>
<h1>AI Studio V2 — Layout grammar prototypes</h1>
<p>Neutral uses one catalog. Niche uses brand-specific fixtures. seed-a vs seed-b shows intra-grammar geometry.</p>
${GRAMMARS.map((g) => {
  const nDesk = `neutral/${g}__neutral__seed-a__desktop.png`;
  const nMob = `neutral/${g}__neutral__seed-a__mobile.png`;
  const kDesk = `niche/${g}__niche__seed-a__desktop.png`;
  const kMob = `niche/${g}__niche__seed-a__mobile.png`;
  const varB = `variation/${g}__neutral__seed-b__desktop.png`;
  return `<h2>${g}</h2><div class="row">
    <figure><img src="${nDesk}" alt="${g} neutral desktop"/><figcaption>neutral · seed-a · desktop</figcaption></figure>
    <figure><img src="${varB}" alt="${g} seed-b"/><figcaption>neutral · seed-b · desktop</figcaption></figure>
    <figure><img src="${nMob}" alt="${g} mobile"/><figcaption>neutral · seed-a · mobile</figcaption></figure>
    <figure><img src="${kDesk}" alt="${g} niche desktop"/><figcaption>niche · seed-a · desktop</figcaption></figure>
    <figure><img src="${kMob}" alt="${g} niche mobile"/><figcaption>niche · seed-a · mobile</figcaption></figure>
  </div>`;
}).join('')}
</body></html>`;
  writeFileSync(resolve(OUT, 'index.html'), index, 'utf8');

  if (overflowFailures.length) {
    console.error('OVERFLOW', overflowFailures);
    process.exit(1);
  }
  console.log(`captured ${shots.length} screenshots → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
