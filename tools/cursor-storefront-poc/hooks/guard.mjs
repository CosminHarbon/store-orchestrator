#!/usr/bin/env node
// @ts-check
// Cursor hook entry point. Registered in the generated workspace's .cursor/hooks.json.
//   node guard.mjs --workspace <abs workspace dir> [--log <abs jsonl path>]
// Reads the hook payload on stdin, writes a {permission,...} decision to stdout.
// Decisions are appended to --log (outside the workspace) so a live run can prove the
// hooks were actually invoked. Any internal error fails closed (deny + exit 2).
import fs from 'node:fs';
import { decide } from './guardPolicy.mjs';

/** @param {string} flag */
function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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

const workspace = arg('--workspace');
const logPath = arg('--log');

/** @param {Record<string, unknown>} entry */
function log(entry) {
  if (!logPath) return;
  try {
    fs.appendFileSync(logPath, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  } catch {
    /* logging must never break enforcement */
  }
}

try {
  if (!workspace) throw new Error('missing --workspace');
  const raw = await readStdin();
  const input = JSON.parse(raw);
  const decision = decide(input, { workspace });
  log({
    event: input.hook_event_name,
    tool: input.tool_name,
    command: typeof input.command === 'string' ? input.command.slice(0, 160) : undefined,
    path: input.file_path,
    permission: decision.permission,
    reason: decision.permission === 'deny' ? decision.user_message : undefined,
  });
  process.stdout.write(`${JSON.stringify(decision)}\n`);
  process.exit(0);
} catch (err) {
  log({ event: 'guard_error', permission: 'deny', reason: String(err instanceof Error ? err.message : err) });
  process.stdout.write(
    `${JSON.stringify({ permission: 'deny', user_message: 'Hook guard error (fail closed).', agent_message: 'Hook guard error; action blocked.' })}\n`,
  );
  process.exit(2);
}
