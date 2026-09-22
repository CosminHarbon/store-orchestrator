/**
 * Package-artifact integration test.
 * Run: npm run test:package-artifact  (from tools/speedvendors-storefront-runtime)
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_INDEX = path.join(ROOT, 'dist', 'index.html');
const ARCHIVE = path.join(ROOT, 'artifacts', 'storefront-build.tar.gz');
const MANIFEST = path.join(ROOT, 'artifacts', 'storefront-manifest.json');

async function listTarGzEntries(archivePath) {
  const gz = readFileSync(archivePath);
  const tarBuf = await new Promise((resolve, reject) => {
    const chunks = [];
    Readable.from(gz)
      .pipe(createGunzip())
      .on('data', (c) => chunks.push(c))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });

  const names = [];
  let offset = 0;
  const block = 512;
  while (offset + block <= tarBuf.length) {
    const header = tarBuf.subarray(offset, offset + block);
    offset += block;
    if (header.every((b) => b === 0)) break;
    const nameEnd = header.indexOf(0);
    const name = header.subarray(0, nameEnd < 0 ? 100 : nameEnd).toString('utf8');
    let sizeStr = '';
    for (let i = 124; i < 136; i++) {
      if (header[i] === 0) break;
      sizeStr += String.fromCharCode(header[i]);
    }
    const size = parseInt(sizeStr.trim(), 8) || 0;
    offset += Math.ceil(size / block) * block;
    if (name) names.push(name.replace(/^\.\//, ''));
  }
  return names;
}

test('build:artifact produces storefront-build.tar.gz with index.html', async (t) => {
  // Build if needed (slow once).
  if (!existsSync(DIST_INDEX)) {
    t.diagnostic('running npm run build…');
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  }
  assert.ok(existsSync(DIST_INDEX), 'dist/index.html must exist after build');

  execFileSync('npm', ['run', 'package-artifact'], { cwd: ROOT, stdio: 'inherit' });

  assert.ok(existsSync(ARCHIVE), 'artifacts/storefront-build.tar.gz');
  assert.ok(existsSync(MANIFEST), 'artifacts/storefront-manifest.json');

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.artifactFormatVersion, 1);
  assert.equal(manifest.entrypoint, 'index.html');
  assert.equal(manifest.archiveFilename, 'storefront-build.tar.gz');
  assert.ok(typeof manifest.archiveSha256 === 'string' && manifest.archiveSha256.length === 64);
  assert.ok(manifest.fileCount >= 1);
  assert.ok(manifest.totalUncompressedBytes > 0);
  assert.equal(manifest.storeId, null);
  assert.equal(manifest.sessionId, null);
  assert.ok(manifest.protectedCommerceSha256);
  assert.equal(typeof manifest.protectedCommerceSha256['src/speedvendors/commerce.ts'], 'string');
  assert.equal(manifest.protectedCommerceSha256['src/speedvendors/commerce.ts'].length, 64);

  const html = readFileSync(DIST_INDEX, 'utf8');
  assert.equal(html.includes('href="/assets/'), false);
  assert.equal(html.includes('src="/assets/'), false);

  const names = await listTarGzEntries(ARCHIVE);
  assert.ok(
    names.some((n) => n === 'index.html' || n.endsWith('/index.html')),
    `archive must contain index.html, got: ${names.slice(0, 10).join(', ')}`,
  );
  for (const n of names) {
    assert.equal(n.includes('..'), false);
    assert.equal(n.startsWith('/'), false);
  }
});
