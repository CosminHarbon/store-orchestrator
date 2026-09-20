import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { ROOT_MARKER } from '../src/config.ts';
import { createWorkspace, resetWorkspace, resolveWorkspacePaths, readState } from '../src/createWorkspace.ts';
import { SafetyError, isEditablePath, snapshotWorkspace, assertWorkspaceClean } from '../src/protectedFiles.ts';
import { cleanup, makeFakeTemplate, tmpDir, write } from './helpers.ts';

let template: string;
let root: string;
before(async () => {
  template = await makeFakeTemplate();
  root = await tmpDir('sv-root-');
});
after(() => cleanup(template, root));

describe('workspace creation', () => {
  it('rejects unsafe merchant ids before touching disk', async () => {
    for (const id of ['../evil', 'A', 'a/b', '', '..']) {
      await assert.rejects(createWorkspace({ merchantId: id, root, templateDir: template, nodeModules: 'skip' }), SafetyError);
    }
    assert.deepEqual((await fs.readdir(root)).filter((n) => n !== ROOT_MARKER), []);
  });

  it('copies the template, writes hook config outside the editable areas, and records a trusted baseline', async () => {
    const { paths, state } = await createWorkspace({ merchantId: 'demo-fashion', root, templateDir: template, nodeModules: 'skip' });
    assert.equal(paths.workspaceDir, path.join(root, 'demo-fashion', 'workspace'));
    for (const rel of ['src/main.tsx', 'src/storefront/App.tsx', 'src/speedvendors/commerce.ts', 'package.json']) {
      await fs.access(path.join(paths.workspaceDir, rel));
    }
    // state / agent store / reports live OUTSIDE the agent's cwd
    for (const p of [paths.stateFile, paths.agentStoreDir, paths.runsDir]) assert.ok(!p.startsWith(`${paths.workspaceDir}${path.sep}`));
    assert.equal(state.agentId, null);
    assert.ok(state.baseline['src/storefront/App.tsx']);
    assert.ok(state.protectedBaseline['.cursor/hooks.json']);
    assert.ok(!state.protectedBaseline['src/storefront/App.tsx'], 'editable files are not in the protected baseline');
    assert.deepEqual((await readState(paths)).merchantId, 'demo-fashion');
    // no symlinks, no credentials
    assertWorkspaceClean(await snapshotWorkspace(paths.workspaceDir));
    // .cursor/** is protected
    assert.equal(isEditablePath('.cursor/hooks.json'), false);
  });

  it('writes a hooks.json matching the documented schema, fail-closed, pointing at the guard', async () => {
    const paths = resolveWorkspacePaths('demo-fashion', root);
    const hooks = JSON.parse(await fs.readFile(path.join(paths.workspaceDir, '.cursor/hooks.json'), 'utf8'));
    assert.equal(hooks.version, 1);
    for (const event of ['beforeShellExecution', 'beforeReadFile', 'preToolUse']) {
      const [entry] = hooks.hooks[event];
      assert.equal(entry.type, 'command');
      assert.equal(entry.failClosed, true);
      assert.match(entry.command, /guard\.mjs/);
      assert.ok(entry.command.includes(paths.workspaceDir));
      assert.ok(entry.command.includes(paths.hookLog));
    }
    const perms = JSON.parse(await fs.readFile(path.join(paths.workspaceDir, '.cursor/permissions.json'), 'utf8'));
    assert.ok(Array.isArray(perms.autoRun.block_instructions));
  });

  it('refuses to create a workspace that already exists', async () => {
    await assert.rejects(createWorkspace({ merchantId: 'demo-fashion', root, templateDir: template, nodeModules: 'skip' }), /already exists/);
  });

  it('refuses a template containing symlinks or credential files', async () => {
    const bad = await makeFakeTemplate();
    await write(bad, '.env', 'SECRET=1\n');
    await assert.rejects(createWorkspace({ merchantId: 'bad-tpl', root, templateDir: bad, nodeModules: 'skip' }), SafetyError);
    await fs.rm(path.join(bad, '.env'));
    await fs.symlink('/etc', path.join(bad, 'public/etc'));
    await assert.rejects(createWorkspace({ merchantId: 'bad-tpl', root, templateDir: bad, nodeModules: 'skip' }), SafetyError);
    await cleanup(bad);
  });

  it('does not use symlinks into another directory for node_modules (real copy)', async () => {
    const tpl = await makeFakeTemplate();
    await write(tpl, 'node_modules/pkg/index.js', 'module.exports = 1;\n');
    const { paths } = await createWorkspace({ merchantId: 'with-deps', root, templateDir: tpl });
    const st = await fs.lstat(path.join(paths.workspaceDir, 'node_modules'));
    assert.ok(st.isDirectory() && !st.isSymbolicLink());
    await cleanup(tpl);
  });
});

describe('reset path safety', () => {
  it('rejects invalid ids and traversal', async () => {
    for (const id of ['../demo-fashion', '..', '/tmp', 'a/../b', '']) await assert.rejects(resetWorkspace(id, root), SafetyError);
  });

  it('refuses a root without the marker file', async () => {
    const stranger = await tmpDir('sv-stranger-');
    await write(stranger, 'victim/state.json', '{}\n');
    await write(stranger, 'victim/precious.txt', 'keep me\n');
    await assert.rejects(resetWorkspace('victim', stranger), /marker missing/);
    await fs.access(path.join(stranger, 'victim/precious.txt'));
    await cleanup(stranger);
  });

  it('refuses a directory that is not one of ours (no state file)', async () => {
    await write(root, 'unrelated/file.txt', 'x\n');
    await assert.rejects(resetWorkspace('unrelated', root), /state file missing/);
    await fs.access(path.join(root, 'unrelated/file.txt'));
  });

  it('refuses when the merchant directory is a symlink (would delete elsewhere)', async () => {
    const elsewhere = await tmpDir('sv-elsewhere-');
    await write(elsewhere, 'state.json', '{}\n');
    await write(elsewhere, 'precious.txt', 'keep me\n');
    await fs.symlink(elsewhere, path.join(root, 'linked'));
    await assert.rejects(resetWorkspace('linked', root), /not a plain directory/);
    await fs.access(path.join(elsewhere, 'precious.txt'));
    await cleanup(elsewhere);
  });

  it('refuses filesystem root and home as workspaces roots', async () => {
    await assert.rejects(resetWorkspace('demo-fashion', '/'), SafetyError);
  });

  it('deletes only the named merchant workspace', async () => {
    await createWorkspace({ merchantId: 'keep-me', root, templateDir: template, nodeModules: 'skip' });
    const removed = await resetWorkspace('demo-fashion', root);
    assert.equal(removed, path.join(root, 'demo-fashion'));
    await assert.rejects(fs.access(path.join(root, 'demo-fashion')));
    await fs.access(path.join(root, 'keep-me', 'workspace', 'src/main.tsx'));
    await fs.access(path.join(root, ROOT_MARKER));
    await assert.rejects(resetWorkspace('demo-fashion', root), /no workspace/);
  });
});
