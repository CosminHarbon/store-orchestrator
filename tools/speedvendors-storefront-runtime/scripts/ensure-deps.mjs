#!/usr/bin/env node
/**
 * Ensure node_modules exists before build (Cloud Agents clone without deps).
 * Skips npm ci when node_modules exists and package-lock.json hash matches stamp.
 * Invokes `npm ci` when needed, else `npm install --no-audit --no-fund`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules');
const VITE = path.join(NM, 'vite');
const LOCK = path.join(ROOT, 'package-lock.json');
const STAMP = path.join(NM, '.sv-deps-lock-sha256');

function lockSha() {
  if (!existsSync(LOCK)) return null;
  return createHash('sha256').update(readFileSync(LOCK)).digest('hex');
}

function writeStamp(hash) {
  if (!hash) return;
  writeFileSync(STAMP, `${hash}\n`, 'utf8');
}

const want = lockSha();

if (existsSync(VITE)) {
  if (want && existsSync(STAMP)) {
    const got = readFileSync(STAMP, 'utf8').trim();
    if (got === want) {
      console.log('[ensure-deps] node_modules up to date (lock stamp match) — skip');
      process.exit(0);
    }
    console.log('[ensure-deps] package-lock changed — reinstalling');
  } else {
    // Deps present (e.g. prior npm ci) but no stamp yet — record and skip.
    writeStamp(want);
    console.log('[ensure-deps] node_modules present — stamp written, skip');
    process.exit(0);
  }
} else {
  console.log('[ensure-deps] node_modules missing — running npm ci');
}

try {
  execFileSync('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
} catch {
  console.log('[ensure-deps] npm ci failed — falling back to npm install');
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

if (!existsSync(VITE)) {
  console.error('[ensure-deps] vite still missing after install');
  process.exit(1);
}

writeStamp(want);
console.log('[ensure-deps] wrote lock stamp');
