#!/usr/bin/env node
// @ts-check
// stop hook: light validation — typecheck/build is expensive; we only check
// forbidden paths / commerce contract presence / secret-like files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEditableRel, isSensitiveName } from './guardPolicy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const REQUIRED = [
  'src/speedvendors/commerce.ts',
  'src/speedvendors/types.ts',
  'package.json',
  'README_AGENT.md',
];

/** @param {string} dir @param {string[]} acc */
function walk(dir, acc) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '.git') continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, acc);
    else acc.push(abs);
  }
}

const problems = [];
for (const rel of REQUIRED) {
  if (!fs.existsSync(path.join(root, rel))) problems.push(`missing ${rel}`);
}

const files = [];
walk(root, files);
for (const abs of files) {
  const rel = path.relative(root, abs).split(path.sep).join('/');
  if (isSensitiveName(rel)) problems.push(`sensitive file present: ${rel}`);
}

// Soft check: if something outside editable prefixes was modified recently we cannot
// know without a baseline; presence of commerce contract is the hard check.
if (!fs.existsSync(path.join(root, 'src/speedvendors/commerce.ts'))) {
  problems.push('commerce contract missing');
}

const ok = problems.length === 0;
process.stdout.write(
  `${JSON.stringify({
    // stop hook: continue the agent turn; surface message if issues
    continue: true,
    userMessage: ok ? undefined : `Validation issues: ${problems.join('; ')}`,
    agentMessage: ok
      ? 'Validation passed (contract + sensitive-path check).'
      : `Fix these before finishing: ${problems.join('; ')}`,
  })}\n`,
);
process.exit(0);
