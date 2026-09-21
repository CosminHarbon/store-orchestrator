#!/usr/bin/env node
/**
 * Ensure node_modules exists before build (Cloud Agents clone without deps).
 * Invokes `npm ci` when possible, else `npm install --no-audit --no-fund`.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules');
const VITE = path.join(NM, 'vite');

if (existsSync(VITE)) {
  process.exit(0);
}

console.log('[ensure-deps] node_modules missing — running npm ci');
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
