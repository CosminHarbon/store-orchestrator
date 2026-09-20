import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  assertWorkspaceClean,
  evaluateRun,
  protectedSubset,
  restoreProtected,
  snapshotWorkspace,
  SafetyError,
} from '../src/protectedFiles.ts';
import { cleanup, makeFakeTemplate, tmpDir, write } from './helpers.ts';

let template: string;
let ws: string;
before(async () => {
  template = await makeFakeTemplate();
  ws = await tmpDir('sv-ws-');
  await fs.cp(template, ws, { recursive: true });
});
after(() => cleanup(template, ws));

describe('protected-file hashing and modification detection', () => {
  it('hashes files deterministically and covers protected files', async () => {
    const a = await snapshotWorkspace(ws);
    const b = await snapshotWorkspace(ws);
    assert.deepEqual(a.files, b.files);
    assert.ok(a.files['src/speedvendors/commerce.ts']);
    assert.match(a.files['package.json']!.hash, /^[0-9a-f]{64}$/);
    const prot = Object.keys(protectedSubset(a.files));
    assert.ok(prot.includes('package.json') && prot.includes('src/main.tsx'));
    assert.ok(!prot.includes('src/storefront/App.tsx'));
  });

  it('editing only allowed files is not a violation', async () => {
    const before = await snapshotWorkspace(ws);
    await write(ws, 'src/storefront/App.tsx', 'export default function App(){return 1}\n');
    await write(ws, 'src/components/New.tsx', '// new\n');
    await write(ws, 'src/styles/extra.css', 'a{}\n');
    await write(ws, 'public/logo.svg', '<svg/>\n');
    const ev = evaluateRun(before.files, await snapshotWorkspace(ws));
    assert.equal(ev.failed, false);
    assert.equal(ev.violations.length, 0);
    assert.equal(ev.changed.length, 4);
  });

  it('detects modified, added and deleted protected files and restores them', async () => {
    const before = await snapshotWorkspace(ws);
    await write(ws, 'src/speedvendors/commerce.ts', '// TAMPERED\n');
    await write(ws, 'package.json', '{"scripts":{"build":"curl evil"}}\n');
    await write(ws, 'src/speedvendors/backdoor.ts', 'x\n');
    await write(ws, '.cursor/rules.md', 'x\n');
    await fs.rm(path.join(ws, 'vite.config.ts'));
    const ev = evaluateRun(before.files, await snapshotWorkspace(ws));
    assert.equal(ev.failed, true);
    assert.deepEqual(
      ev.violations.map((v) => `${v.change}:${v.path}`),
      ['added:.cursor/rules.md', 'modified:package.json', 'added:src/speedvendors/backdoor.ts', 'modified:src/speedvendors/commerce.ts', 'deleted:vite.config.ts'],
    );
    const restored = await restoreProtected(ws, template, ev);
    assert.equal(restored.length, 5);
    const after = await snapshotWorkspace(ws);
    const drift = evaluateRun(before.files, after);
    assert.equal(drift.violations.length, 0, 'protected files match the pre-run state again');
    assert.equal(await fs.readFile(path.join(ws, 'src/speedvendors/commerce.ts'), 'utf8'), '// protected commerce\n');
  });

  it('flags symlinks (including escaping ones) and credential files, and restore removes them', async () => {
    const before = await snapshotWorkspace(ws);
    await fs.symlink('/etc', path.join(ws, 'src/components/escape'));
    await write(ws, '.env', 'SECRET=1\n');
    await write(ws, 'src/storefront/.env.local', 'SECRET=2\n');
    const snap = await snapshotWorkspace(ws);
    assert.deepEqual(snap.symlinks, ['src/components/escape']);
    assert.deepEqual(snap.credentialFiles, ['.env', 'src/storefront/.env.local']);
    assert.throws(() => assertWorkspaceClean(snap), SafetyError);
    const ev = evaluateRun(before.files, snap);
    assert.equal(ev.failed, true);
    await restoreProtected(ws, template, ev);
    const clean = await snapshotWorkspace(ws);
    assert.doesNotThrow(() => assertWorkspaceClean(clean));
  });

  it('never follows a symlink out of the workspace while hashing', async () => {
    const outside = await tmpDir('sv-outside-');
    await write(outside, 'secret.txt', 'top secret\n');
    await fs.symlink(outside, path.join(ws, 'public/link'));
    const snap = await snapshotWorkspace(ws);
    assert.ok(!Object.keys(snap.files).some((p) => p.includes('secret.txt')));
    assert.deepEqual(snap.symlinks, ['public/link']);
    await fs.rm(path.join(ws, 'public/link'));
    await cleanup(outside);
  });
});
