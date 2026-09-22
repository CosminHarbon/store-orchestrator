#!/usr/bin/env node
/**
 * Package the Vite `dist/` output into a deterministic storefront artifact.
 *
 * Cloud Agents: write via shell `mkdir` + `tar` into `/opt/cursor/artifacts/`
 * (that mount is what the Artifacts API indexes). Pure Node writes alone have
 * produced empty `GET /v1/agents/{id}/artifacts` lists in practice.
 *
 * Local: pure Node ustar+gzip into repo `artifacts/`.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { validateGenerated } from './validate-generated.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const INDEX = path.join(DIST, 'index.html');
const SV_ROOT = path.join(ROOT, 'src/speedvendors');

const ARCHIVE_FILENAME = 'storefront-build.tar.gz';
const MANIFEST_FILENAME = 'storefront-manifest.json';
const ARTIFACT_FORMAT_VERSION = 1;

const LOCAL_ARTIFACTS = path.join(ROOT, 'artifacts');
const CLOUD_ARTIFACTS = '/opt/cursor/artifacts';

/** @param {string} dir @param {string} [base] */
function walkTsRel(dir, base = dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...walkTsRel(abs, base));
    } else if (name.isFile() && /\.(ts|tsx)$/.test(name.name)) {
      out.push(path.relative(base, abs).split(path.sep).join('/'));
    }
  }
  return out;
}

function listProtectedCommerceFiles() {
  if (!existsSync(SV_ROOT)) fail(`missing ${SV_ROOT}`);
  return walkTsRel(SV_ROOT)
    .map((r) => `src/speedvendors/${r}`)
    .sort((a, b) => a.localeCompare(b));
}

function fail(msg, code = 1) {
  console.error(`[package-artifact] ${msg}`);
  process.exit(code);
}

function rewriteIndexHtml(html) {
  return html
    .replaceAll('href="/assets/', 'href="./assets/')
    .replaceAll('src="/assets/', 'src="./assets/')
    .replaceAll("href='/assets/", "href='./assets/")
    .replaceAll("src='/assets/", "src='./assets/")
    .replaceAll('"/assets/', '"./assets/')
    .replaceAll("'/assets/", "'./assets/");
}

function walkFiles(dir, base = dir) {
  /** @type {{ rel: string, abs: string, size: number }[]} */
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...walkFiles(abs, base));
    } else if (name.isFile()) {
      const rel = path.relative(base, abs).split(path.sep).join('/');
      if (rel.includes('..') || path.isAbsolute(rel)) {
        fail(`refusing unsafe relative path in dist: ${rel}`);
      }
      out.push({ rel, abs, size: statSync(abs).size });
    }
  }
  return out;
}

function resolveRuntimeCommitSha() {
  if (process.env.CURSOR_RUNTIME_COMMIT_SHA) {
    return String(process.env.CURSOR_RUNTIME_COMMIT_SHA).trim() || 'unknown';
  }
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

function protectedCommerceSha256Map() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rel of listProtectedCommerceFiles()) {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) fail(`missing protected commerce source: ${rel}`);
    out[rel] = createHash('sha256').update(readFileSync(abs)).digest('hex');
  }
  return out;
}

function pad512(buf) {
  const rem = buf.length % 512;
  if (rem === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(512 - rem)]);
}

/** @param {{ rel: string, abs: string }[]} files */
function buildUstar(files) {
  /** @type {Buffer[]} */
  const parts = [];
  for (const file of files) {
    const content = readFileSync(file.abs);
    const name = file.rel.slice(0, 100);
    const header = Buffer.alloc(512, 0);
    header.write(name, 0, 'utf8');
    header.write('0000644\0', 100, 'utf8');
    header.write('0000000\0', 108, 'utf8');
    header.write('0000000\0', 116, 'utf8');
    header.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 'utf8');
    header.write('00000000000\0', 136, 'utf8');
    header.write('        ', 148, 'utf8');
    header.write('0', 156, 'utf8');
    header.write('ustar\0', 257, 'utf8');
    header.write('00', 263, 'utf8');
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf8');
    parts.push(header, pad512(content));
  }
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

function buildArchiveBytes(files) {
  return gzipSync(buildUstar(files), { level: 9 });
}

function writeLocal(archiveBytes, manifest) {
  try {
    mkdirSync(LOCAL_ARTIFACTS, { recursive: true });
    writeFileSync(path.join(LOCAL_ARTIFACTS, ARCHIVE_FILENAME), archiveBytes);
    writeFileSync(
      path.join(LOCAL_ARTIFACTS, MANIFEST_FILENAME),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    console.log(`[package-artifact] wrote ${path.join(LOCAL_ARTIFACTS, ARCHIVE_FILENAME)}`);
    return true;
  } catch (e) {
    console.warn(`[package-artifact] local write failed: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

/**
 * Cloud packaging: shell mkdir + tar into the Artifacts mount (API-indexed),
 * then Node write for the JSON manifest (+ copy archive if tar used a temp).
 */
function writeCloud(archiveBytes, manifest) {
  const archivePath = path.join(CLOUD_ARTIFACTS, ARCHIVE_FILENAME);
  const manifestPath = path.join(CLOUD_ARTIFACTS, MANIFEST_FILENAME);

  try {
    execFileSync('mkdir', ['-p', CLOUD_ARTIFACTS], { stdio: 'inherit' });
  } catch (e) {
    console.warn(
      `[package-artifact] cloud mkdir failed: ${e instanceof Error ? e.message : e}`,
    );
    return false;
  }

  // Prefer shell tar directly into the mount (matches prior successful uploads).
  try {
    execFileSync('tar', ['-czf', archivePath, '-C', DIST, '.'], { stdio: 'inherit' });
  } catch (e) {
    console.warn(
      `[package-artifact] cloud tar failed (${e instanceof Error ? e.message : e}); falling back to Node write`,
    );
    try {
      writeFileSync(archivePath, archiveBytes);
    } catch (e2) {
      console.warn(
        `[package-artifact] cloud archive write failed: ${e2 instanceof Error ? e2.message : e2}`,
      );
      return false;
    }
  }

  try {
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (e) {
    // If Node cannot write the mount, try copying from local after ensuring local exists.
    try {
      const localManifest = path.join(LOCAL_ARTIFACTS, MANIFEST_FILENAME);
      writeFileSync(localManifest, `${JSON.stringify(manifest, null, 2)}\n`);
      execFileSync('cp', [localManifest, manifestPath], { stdio: 'inherit' });
    } catch (e2) {
      console.warn(
        `[package-artifact] cloud manifest write failed: ${e2 instanceof Error ? e2.message : e2}`,
      );
      return false;
    }
  }

  // Ensure archive bytes match our deterministic digest when tar was used
  // (shell tar may differ slightly). Re-copy deterministic archive via cp from local.
  try {
    const localArchive = path.join(LOCAL_ARTIFACTS, ARCHIVE_FILENAME);
    if (existsSync(localArchive)) {
      execFileSync('cp', [localArchive, archivePath], { stdio: 'inherit' });
    }
  } catch {
    /* keep shell tar output if cp fails */
  }

  if (!existsSync(archivePath) || statSync(archivePath).size < 1024) {
    console.warn('[package-artifact] cloud archive missing or too small');
    return false;
  }
  console.log(`[package-artifact] wrote ${archivePath}`);
  console.log(`[package-artifact] wrote ${manifestPath}`);
  return true;
}

function main() {
  try {
    const v = validateGenerated(ROOT);
    console.log(`[package-artifact] validate-generated ok scanned=${v.scanned}`);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }

  if (!existsSync(INDEX)) fail(`missing ${INDEX} — run "npm run build" first`);

  const rawHtml = readFileSync(INDEX, 'utf8');
  const rewritten = rewriteIndexHtml(rawHtml);
  if (rewritten !== rawHtml) {
    writeFileSync(INDEX, rewritten, 'utf8');
    console.log('[package-artifact] rewrote absolute /assets/ paths in dist/index.html');
  }

  const files = walkFiles(DIST);
  if (files.length === 0) fail('dist/ is empty');
  files.sort((a, b) => a.rel.localeCompare(b.rel));

  const totalUncompressedBytes = files.reduce((n, f) => n + f.size, 0);
  const archiveBytes = buildArchiveBytes(files);
  const archiveSha256 = createHash('sha256').update(archiveBytes).digest('hex');

  const manifest = {
    artifactFormatVersion: ARTIFACT_FORMAT_VERSION,
    entrypoint: 'index.html',
    archiveFilename: ARCHIVE_FILENAME,
    archiveSha256,
    fileCount: files.length,
    totalUncompressedBytes,
    buildTimestamp: new Date().toISOString(),
    runtimeCommitSha: resolveRuntimeCommitSha(),
    protectedCommerceSha256: protectedCommerceSha256Map(),
    storeId: null,
    sessionId: null,
    runId: null,
    versionId: null,
  };

  const wroteLocal = writeLocal(archiveBytes, manifest);

  // Treat Cloud Agents as "cloud" when /opt/cursor exists OR the artifacts mount exists
  // OR an explicit env forces it. Local Cursor IDE sets CURSOR_AGENT=1 — ignore that.
  const looksLikeCloudVm =
    existsSync('/opt/cursor') ||
    existsSync(CLOUD_ARTIFACTS) ||
    process.env.CURSOR_REQUIRE_CLOUD_ARTIFACTS === '1';

  let wroteCloud = false;
  if (looksLikeCloudVm) {
    wroteCloud = writeCloud(archiveBytes, manifest);
    if (!wroteCloud) {
      fail(
        'cloud packaging failed — /opt/cursor/artifacts must contain storefront-build.tar.gz',
      );
    }
  } else {
    // Best-effort: if mkdir happens to work, still publish.
    wroteCloud = writeCloud(archiveBytes, manifest);
  }

  if (!wroteLocal && !wroteCloud) fail('could not write artifact to any destination');

  console.log(
    `[package-artifact] ok sha256=${archiveSha256.slice(0, 12)}… files=${files.length} bytes=${totalUncompressedBytes} local=${wroteLocal} cloud=${wroteCloud}`,
  );
}

main();
