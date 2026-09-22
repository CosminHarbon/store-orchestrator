#!/usr/bin/env node
// @ts-check
// Cloud-agent hook entry: workspace comes from stdin payload (workspace_roots / cwd).
// Usage from .cursor/hooks.json:
//   node .cursor/hooks/guard.mjs beforeShellExecution
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './guardPolicy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @returns {Promise<string>} */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * @param {Record<string, unknown>} input
 * @returns {string}
 */
function resolveWorkspace(input) {
  const roots = input.workspace_roots;
  if (Array.isArray(roots) && typeof roots[0] === 'string' && roots[0]) return roots[0];
  if (typeof input.cwd === 'string' && input.cwd) return input.cwd;
  // hooks live in <repo>/.cursor/hooks → repo root is ../..
  return path.resolve(__dirname, '../..');
}

try {
  const eventHint = process.argv[2];
  const raw = await readStdin();
  const input = raw.trim() ? JSON.parse(raw) : {};
  if (eventHint && !input.hook_event_name) input.hook_event_name = eventHint;
  const workspace = resolveWorkspace(input);
  const decision = decide(input, { workspace });
  process.stdout.write(`${JSON.stringify(decision)}\n`);
  process.exit(0);
} catch (err) {
  process.stdout.write(
    `${JSON.stringify({
      permission: 'deny',
      user_message: 'Hook guard error (fail closed).',
      agent_message: `Hook guard error: ${err instanceof Error ? err.message : String(err)}`,
    })}\n`,
  );
  process.exit(2);
}
