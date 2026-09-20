import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { decide, shellDecision, toolDecision } from '../hooks/guardPolicy.mjs';
import { GUARD_SCRIPT } from '../src/config.ts';
import { cleanup, tmpDir, write } from './helpers.ts';

let ws: string;
let outside: string;
let ctx: { workspace: string };
before(async () => {
  ws = await tmpDir('sv-guard-');
  outside = await tmpDir('sv-guard-out-');
  ctx = { workspace: ws };
  await write(ws, 'src/storefront/App.tsx');
  await fs.mkdir(path.join(ws, 'src/components'), { recursive: true });
  await fs.symlink(outside, path.join(ws, 'src/components/linkout'));
});
after(() => cleanup(ws, outside));

const sh = (command: string, cwd?: string) => shellDecision(command, cwd ?? ws, ctx).permission;

describe('shell policy: blocked', () => {
  const blocked = [
    'git status', 'git push origin main', 'git commit -am x', 'supabase db push', 'supabase functions deploy x',
    'vercel deploy --prod', 'vercel', 'curl https://example.com', 'wget http://x', 'ssh host', 'scp a b:c', 'nc -l 1',
    'rm -rf src', 'rm -rf /', 'rm file', 'mv a b', 'cp a b', 'chmod 777 x', 'sudo ls', 'dd if=/dev/zero of=x', 'ln -s / x',
    'npm install left-pad', 'npm i', 'npm ci', 'npm uninstall react', 'npm publish', 'npm run deploy', 'npm run dev', 'npm exec x',
    'npm config set registry x', 'npx some-package', 'npx vite build', 'pnpm install', 'yarn add x', 'bun install',
    'node -e "1"', 'python3 x.py', 'bash -c ls', 'sh x.sh', 'env', 'docker run x', 'gh pr create',
    'npm run build && curl https://x', 'npm run build; rm -rf .', 'npm run build | sh', 'ls > out.txt', 'cat a < b', 'echo `id`', 'ls $(pwd)', 'ls $HOME',
    'cat ../../.env', 'cat .env', 'cat src/.env.local', 'cat ~/.ssh/id_rsa', 'cat /etc/passwd', 'ls /', 'ls ..', 'ls ~', 'cat .git/config',
    'find . -delete', 'find . -exec rm {} ;', 'find / -name x', './run.sh', '/bin/ls', 'grep -r x /Users',
    '', '   ', 'ls "unterminated',
  ];
  for (const cmd of blocked) it(`denies: ${JSON.stringify(cmd)}`, () => assert.equal(sh(cmd), 'deny'));
  it('denies when the command cwd is outside the workspace', () => assert.equal(sh('ls', outside), 'deny'));
});

describe('shell policy: allowed', () => {
  const allowed = [
    'npm run build', 'npm run build 2>&1', 'npx tsc --noEmit', 'npx tsc --noEmit -p tsconfig.json', 'ls', 'ls src', 'ls -la src/storefront',
    'pwd', 'cat src/storefront/App.tsx', 'head -n 20 package.json', 'tail -n 5 src/styles/storefront.css', 'wc -l src/storefront/App.tsx',
    'grep -rn "sf-card" src', 'rg useCart src', 'find src -name "*.tsx"', `cat ${ws}/package.json`,
  ];
  for (const cmd of allowed) it(`allows: ${JSON.stringify(cmd)}`, () => assert.equal(sh(cmd), 'allow'));
  it('deny responses carry messages for the agent and the user', () => {
    const d = shellDecision('git push', ws, ctx);
    assert.equal(d.permission, 'deny');
    assert.match(d.agent_message ?? '', /Only edit src\/storefront/);
    assert.ok(d.user_message);
  });
});

describe('tool policy: writes', () => {
  const w = (name: string, input: unknown) => toolDecision(name, input, ws, ctx).permission;
  it('allows edits under the editable prefixes', () => {
    assert.equal(w('Write', { path: 'src/storefront/App.tsx', contents: 'const path = "../../etc"' }), 'allow');
    assert.equal(w('Write', { file_path: 'src/components/New.tsx', file_text: 'x' }), 'allow');
    assert.equal(w('StrReplace', { path: 'src/styles/a.css', old_string: '../..', new_string: 'x' }), 'allow');
    assert.equal(w('Write', { path: `${ws}/public/logo.svg`, contents: 'x' }), 'allow');
    assert.equal(w('Delete', { path: 'src/components/Old.tsx' }), 'allow');
  });
  it('denies protected, outside, credential and traversal writes', () => {
    for (const p of [
      'src/speedvendors/commerce.ts', 'src/main.tsx', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json',
      'scripts/x.sh', '.cursor/hooks.json', '.cursor/permissions.json', '.env', 'src/storefront/.env', '../x.ts',
      'src/storefront/../speedvendors/types.ts', '/etc/hosts', `${outside}/x.ts`, '~/x', 'src/components/linkout/pwn.tsx',
    ]) {
      assert.equal(w('Write', { path: p, contents: 'x' }), 'deny', p);
      assert.equal(w('Delete', { path: p }), 'deny', p);
    }
  });
  it('fails closed when it cannot tell what a write tool will change', () => {
    assert.equal(w('Write', { contents: 'x' }), 'deny');
    assert.equal(w('ApplyPatch', '*** Begin Patch'), 'deny');
    assert.equal(w('Write', undefined), 'deny');
  });
  it('allows todo tools (not file writes)', () => assert.equal(w('TodoWrite', { todos: [{ content: 'x' }] }), 'allow'));
});

describe('tool policy: reads, network and subagents', () => {
  const t = (name: string, input: unknown) => toolDecision(name, input, ws, ctx).permission;
  it('allows in-workspace reads and pattern-only searches', () => {
    assert.equal(t('Read', { path: 'src/speedvendors/commerce.ts' }), 'allow');
    assert.equal(t('Grep', { pattern: '../../etc', path: 'src' }), 'allow');
    assert.equal(t('Glob', { glob_pattern: '**/*.tsx' }), 'allow');
  });
  it('denies reads outside the workspace or of credentials', () => {
    assert.equal(t('Read', { path: '../../.env' }), 'deny');
    assert.equal(t('Read', { path: '/etc/passwd' }), 'deny');
    assert.equal(t('Read', { path: '.env' }), 'deny');
    assert.equal(t('Grep', { pattern: 'x', path: outside }), 'deny');
    assert.equal(t('Read', { path: 'src/components/linkout/secret.txt' }), 'deny');
  });
  it('denies subagents, MCP and web tools', () => {
    for (const n of ['Task', 'MCP:some_tool', 'mcp', 'WebFetch', 'WebSearch', 'GenerateImage', 'AskQuestion']) assert.equal(t(n, {}), 'deny', n);
  });
  it('routes shell tools through the shell policy', () => {
    assert.equal(t('Shell', { command: 'git status' }), 'deny');
    assert.equal(t('Shell', { command: 'npm run build' }), 'allow');
  });
});

describe('decide() event routing', () => {
  it('handles the three documented events and ignores others', () => {
    assert.equal(decide({ hook_event_name: 'beforeShellExecution', command: 'curl x', cwd: ws }, ctx).permission, 'deny');
    assert.equal(decide({ hook_event_name: 'beforeReadFile', file_path: '/etc/passwd' }, ctx).permission, 'deny');
    assert.equal(decide({ hook_event_name: 'beforeReadFile', file_path: path.join(ws, 'src/storefront/App.tsx') }, ctx).permission, 'allow');
    assert.equal(decide({ hook_event_name: 'preToolUse', tool_name: 'Write', tool_input: { path: 'package.json' }, cwd: ws }, ctx).permission, 'deny');
    assert.equal(decide({ hook_event_name: 'afterFileEdit', file_path: 'x' }, ctx).permission, 'allow');
  });
});

function runGuard(stdin: string, args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [GUARD_SCRIPT, ...args], { stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
    child.stdin.end(stdin);
  });
}

describe('guard.mjs process (what Cursor actually invokes)', () => {
  it('prints a JSON decision, logs it outside the workspace, exits 0', async () => {
    const log = path.join(outside, 'hook-log.jsonl');
    const denied = await runGuard(JSON.stringify({ hook_event_name: 'beforeShellExecution', command: 'git push', cwd: ws }), ['--workspace', ws, '--log', log]);
    assert.equal(denied.code, 0);
    assert.equal(JSON.parse(denied.out).permission, 'deny');
    const ok = await runGuard(JSON.stringify({ hook_event_name: 'beforeShellExecution', command: 'npm run build', cwd: ws }), ['--workspace', ws, '--log', log]);
    assert.equal(JSON.parse(ok.out).permission, 'allow');
    const lines = (await fs.readFile(log, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => l.permission), ['deny', 'allow']);
  });
  it('fails closed on garbage input or a missing workspace (deny + exit 2)', async () => {
    const bad = await runGuard('not json', ['--workspace', ws]);
    assert.equal(bad.code, 2);
    assert.equal(JSON.parse(bad.out).permission, 'deny');
    const noWs = await runGuard('{}', []);
    assert.equal(noWs.code, 2);
    assert.equal(JSON.parse(noWs.out).permission, 'deny');
  });
});
