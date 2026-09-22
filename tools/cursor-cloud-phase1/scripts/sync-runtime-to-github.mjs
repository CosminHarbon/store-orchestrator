#!/usr/bin/env node
/**
 * Documented sync helper: compare monorepo mirror packaging files vs a cloned tip.
 *
 * Does NOT push. Does NOT invent packaging. For full check prefer:
 *   bash tools/speedvendors-storefront-runtime/scripts/check-runtime-sync.sh
 *
 * Env:
 *   RUNTIME_REMOTE_URL — git URL (default github.com:CosminHarbon/speedvendors-storefront-runtime.git)
 *   RUNTIME_CLONE_DIR  — existing clone to compare (skip clone)
 *   SYNC_COMMIT_MESSAGE — required only if --commit (disabled by default; this script checks only)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHASE1_ROOT = path.resolve(__dirname, '..');
const MIRROR = path.resolve(PHASE1_ROOT, '../speedvendors-storefront-runtime');
const REMOTE =
  process.env.RUNTIME_REMOTE_URL ||
  'git@github.com:CosminHarbon/speedvendors-storefront-runtime.git';

const KEYS = [
  '.cursor/hooks/guardPolicy.mjs',
  'scripts/package-artifact.mjs',
  'package.json',
  'README_AGENT.md',
];

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function main() {
  console.log('Mirror:', MIRROR);
  console.log('Remote:', REMOTE);
  console.log('See tools/speedvendors-storefront-runtime/RUNTIME_SOURCE_OF_TRUTH.md');

  for (const rel of KEYS) {
    const abs = path.join(MIRROR, rel);
    if (!existsSync(abs)) {
      console.error('MISSING local', rel);
      process.exit(1);
    }
    console.log(`${sha256(abs)}  local/${rel}`);
  }

  let cloneDir = process.env.RUNTIME_CLONE_DIR;
  let cleanup = null;
  if (!cloneDir) {
    try {
      cloneDir = mkdtempSync(path.join(tmpdir(), 'sv-runtime-'));
      cleanup = () => rmSync(cloneDir, { recursive: true, force: true });
      execFileSync('git', ['clone', '--depth', '1', REMOTE, path.join(cloneDir, 'repo')], {
        stdio: 'inherit',
      });
      cloneDir = path.join(cloneDir, 'repo');
    } catch (e) {
      console.warn('Clone failed (offline or no credentials). Local hashes printed only.');
      if (cleanup) cleanup();
      process.exit(0);
    }
  }

  let mismatch = 0;
  for (const rel of KEYS) {
    const a = path.join(MIRROR, rel);
    const b = path.join(cloneDir, rel);
    if (!existsSync(b)) {
      console.error('MISSING remote', rel);
      mismatch = 1;
      continue;
    }
    const ha = sha256(a);
    const hb = sha256(b);
    if (ha !== hb) {
      console.error(`DIFF ${rel}\n  local  ${ha}\n  remote ${hb}`);
      mismatch = 1;
    } else {
      console.log(`OK ${rel}`);
    }
  }

  if (cleanup) cleanup();
  if (mismatch) {
    console.error('FAIL: mirror differs from tip — sync before pinning Cloud Agents.');
    process.exit(1);
  }
  console.log('OK: packaging/guard files match.');
}

main();
