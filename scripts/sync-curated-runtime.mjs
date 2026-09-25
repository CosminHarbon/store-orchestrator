#!/usr/bin/env node
/**
 * Copy the built Novatee storefront runtime into public/curated-runtimes/novatee
 * so the merchant Website Builder can iframe-preview it with live commerce.
 *
 * Usage (from monorepo root or this package):
 *   node scripts/sync-curated-runtime.mjs
 *   npm run sync:curated-runtime  (root or runtime package)
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const runtimeRoot = join(repoRoot, 'tools/speedvendors-storefront-runtime');
const dist = join(runtimeRoot, 'dist');
const out = join(repoRoot, 'public/curated-runtimes/novatee');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('[sync-curated-runtime] Missing runtime dist at', dist);
  console.error('Build first: cd tools/speedvendors-storefront-runtime && npm run build');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(dist, out, { recursive: true });

// Ensure index uses relative asset paths when opened under /curated-runtimes/novatee/
const indexPath = join(out, 'index.html');
let html = readFileSync(indexPath, 'utf8');
html = html
  .replaceAll('href="/assets/', 'href="./assets/')
  .replaceAll('src="/assets/', 'src="./assets/')
  .replaceAll('href="/favicon', 'href="./favicon')
  .replaceAll('href="/themes/', 'href="./themes/')
  .replaceAll('src="/themes/', 'src="./themes/');
writeFileSync(indexPath, html);

writeFileSync(
  join(out, 'SYNC_META.json'),
  JSON.stringify(
    {
      themeId: 'novatee',
      syncedAt: new Date().toISOString(),
      source: 'tools/speedvendors-storefront-runtime/dist',
      note: 'Monorepo mirror artifact. Private tip sync required before Cloud Agent packaging pins.',
    },
    null,
    2,
  ),
);

console.log('[sync-curated-runtime] ok → public/curated-runtimes/novatee');
