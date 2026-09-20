import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { buildStorefront } from '../src/buildStorefront.ts';
import { PACKAGE_ROOT, TEMPLATE_DIR } from '../src/config.ts';
import { createWorkspace } from '../src/createWorkspace.ts';
import { snapshotWorkspace } from '../src/protectedFiles.ts';
import { cleanup, tmpDir } from './helpers.ts';

async function listFiles(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await listFiles(p, out);
    else out.push(p);
  }
  return out;
}

describe('template hygiene', () => {
  it('contains no SDK import, no API key handling, no VITE_ variables, no secrets, no production endpoints', async () => {
    const files = (await listFiles(TEMPLATE_DIR)).filter((f) => /\.(tsx?|css|html|json|svg)$/.test(f) && !f.endsWith('package-lock.json'));
    assert.ok(files.length > 10);
    for (const f of files) {
      const text = await fs.readFile(f, 'utf8');
      const rel = path.relative(TEMPLATE_DIR, f);
      assert.ok(!/@cursor\/sdk/.test(text), `${rel} imports the SDK`);
      assert.ok(!/CURSOR_API_KEY/.test(text), `${rel} mentions the API key`);
      assert.ok(!/VITE_/.test(text), `${rel} uses a VITE_ variable`);
      assert.ok(!/import\.meta\.env/.test(text), `${rel} reads env`);
      assert.ok(!/supabase|netopia|oblio|awb|stripe|sameday|fancourier/i.test(text), `${rel} references a production service`);
      assert.ok(!/\bfetch\(|XMLHttpRequest|WebSocket/.test(text), `${rel} makes network calls`);
    }
  });

  it('has no env files or symlinks', async () => {
    const snap = await snapshotWorkspace(TEMPLATE_DIR);
    assert.deepEqual(snap.credentialFiles, []);
    assert.deepEqual(snap.symlinks, []);
  });

  it('is a separate package: the PoC depends on the SDK, the template does not', async () => {
    const poc = JSON.parse(await fs.readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
    const tpl = JSON.parse(await fs.readFile(path.join(TEMPLATE_DIR, 'package.json'), 'utf8'));
    assert.equal(poc.private, true);
    assert.equal(tpl.private, true);
    assert.equal(poc.engines.node, '>=22.13');
    assert.ok(poc.dependencies['@cursor/sdk']);
    assert.ok(!('@cursor/sdk' in (tpl.dependencies ?? {})) && !('@cursor/sdk' in (tpl.devDependencies ?? {})));
  });
});

describe('baseline storefront build', () => {
  let root: string;
  before(async () => {
    root = await tmpDir('sv-build-');
  });
  after(() => cleanup(root));

  it('builds the template as shipped', async (t) => {
    try {
      await fs.access(path.join(TEMPLATE_DIR, 'node_modules'));
    } catch {
      t.skip('template dependencies not installed (run: npm run setup)');
      return;
    }
    const r = await buildStorefront(TEMPLATE_DIR, { timeoutMs: 120_000 });
    assert.equal(r.ok, true, r.output);
    await fs.access(path.join(TEMPLATE_DIR, 'dist', 'index.html'));
  });

  it('builds inside a freshly created merchant workspace, and the build changes no tracked file', async (t) => {
    try {
      await fs.access(path.join(TEMPLATE_DIR, 'node_modules'));
    } catch {
      t.skip('template dependencies not installed (run: npm run setup)');
      return;
    }
    const { paths } = await createWorkspace({ merchantId: 'baseline-build', root });
    const before = await snapshotWorkspace(paths.workspaceDir);
    const r = await buildStorefront(paths.workspaceDir, { timeoutMs: 120_000 });
    assert.equal(r.ok, true, r.output);
    const after = await snapshotWorkspace(paths.workspaceDir);
    assert.deepEqual(after.files, before.files, 'npm run build must not modify hashed files (incl. node_modules/.package-lock.json)');
    assert.ok(!r.output.includes(paths.workspaceDir), 'absolute workspace paths are sanitised');
  });

  it('reports a sanitised, bounded failure for a broken presentation layer', async (t) => {
    try {
      await fs.access(path.join(TEMPLATE_DIR, 'node_modules'));
    } catch {
      t.skip('template dependencies not installed');
      return;
    }
    const { paths } = await createWorkspace({ merchantId: 'broken-build', root });
    await fs.writeFile(path.join(paths.workspaceDir, 'src/storefront/App.tsx'), 'export default function App() { return <div>{missing}</div>; }\n');
    const r = await buildStorefront(paths.workspaceDir, { timeoutMs: 120_000 });
    assert.equal(r.ok, false);
    assert.match(r.output, /missing/);
    assert.ok(r.output.length <= 6100);
  });
});

describe('CLI (offline)', () => {
  function cli(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; out: string; err: string }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, ['--import', 'tsx', path.join(PACKAGE_ROOT, 'src/cli.ts'), ...args], {
        cwd: PACKAGE_ROOT,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('close', (code) => resolve({ code, out, err }));
    });
  }

  it('refuses a live run without CURSOR_API_KEY and never prints a key', async () => {
    const r = await cli(['generate', '--merchant', 'demo-fashion', '--prompt', 'x']);
    assert.equal(r.code, 2);
    assert.match(r.err, /CURSOR_API_KEY is not set/);
  });

  it('rejects an unsafe merchant id', async () => {
    const r = await cli(['generate', '--merchant', '../evil', '--prompt', 'x', '--dry-run']);
    assert.equal(r.code, 2);
    assert.match(r.err, /invalid merchant id/);
  });

  it('reset requires --yes', async () => {
    const r = await cli(['reset', '--merchant', 'demo-fashion']);
    assert.equal(r.code, 2);
    assert.match(r.err, /--yes/);
  });

  it('dry-run creates a workspace and builds it without any Cursor call', async (t) => {
    try {
      await fs.access(path.join(TEMPLATE_DIR, 'node_modules'));
    } catch {
      t.skip('template dependencies not installed');
      return;
    }
    const root = await tmpDir('sv-cli-');
    const r = await cli(['generate', '--merchant', 'dry-demo', '--prompt', 'A premium minimalist fashion store', '--dry-run', '--root', root]);
    assert.equal(r.code, 0, `${r.out}\n${r.err}`);
    assert.match(r.out, /Result: SUCCEEDED/);
    assert.match(r.out, /final build  passed/);
    assert.match(r.err, /DRY RUN/);
    assert.match(r.err, /must not be exposed to real merchants/);
    const rr = await cli(['reset', '--merchant', 'dry-demo', '--yes', '--root', root]);
    assert.equal(rr.code, 0, rr.err);
    await cleanup(root);
  });
});
