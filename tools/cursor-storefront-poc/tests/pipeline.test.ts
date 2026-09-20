import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { BuildResult } from '../src/buildStorefront.ts';
import { readState } from '../src/createWorkspace.ts';
import { runPipeline } from '../src/pipeline.ts';
import { SafetyError, snapshotWorkspace } from '../src/protectedFiles.ts';
import { MissingApiKeyError, type AgentDriver, type DriverInput, type DriverResult } from '../src/runAgent.ts';
import { cleanup, makeFakeTemplate, tmpDir, write } from './helpers.ts';

let template: string;
let root: string;
before(async () => {
  template = await makeFakeTemplate();
  root = await tmpDir('sv-pipe-');
});
after(() => cleanup(template, root));

const usage = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 30, cacheWriteTokens: 20, cacheTokens: 50, totalTokens: 200 };
function result(over: Partial<DriverResult> = {}): DriverResult {
  return {
    agentId: 'agent-fake-1', runId: 'run-1', status: 'finished', model: 'composer-2.5', durationMs: 1000,
    usage, cost: { chargedCents: 1.5, rawCostCents: 2.5 }, costPending: false, agentUsageTotal: null, ...over,
  };
}
const ok = (ms = 5): BuildResult => ({ ok: true, exitCode: 0, timedOut: false, durationMs: ms, output: '' });
const fail = (msg = 'error TS2322: bad'): BuildResult => ({ ok: false, exitCode: 1, timedOut: false, durationMs: 5, output: msg });
const base = (id: string) => ({ merchantId: id, root, templateDir: template, nodeModules: 'skip' as const });

describe('pipeline (fake Cursor driver, no API key)', () => {
  it('happy path: allowed edits, build passes, usage and cost reported exactly, never published', async () => {
    const driver: AgentDriver = async ({ paths }) => {
      await write(paths.workspaceDir, 'src/storefront/App.tsx', 'export default function App(){return 42}\n');
      await write(paths.workspaceDir, 'src/styles/new.css', 'a{}\n');
      return result();
    };
    const r = await runPipeline({ ...base('happy'), prompt: 'premium minimalist store', kind: 'generate', driver, buildFn: async () => ok() });
    assert.equal(r.status, 'succeeded');
    assert.equal(r.autoPublished, false);
    assert.equal(r.runs.length, 1);
    assert.equal(r.runs[0]!.build.status, 'passed');
    assert.deepEqual(r.changedFiles.map((c) => `${c.change}:${c.path}`), ['modified:src/storefront/App.tsx', 'added:src/styles/new.css']);
    assert.equal(r.totals.usage?.totalTokens, 200);
    assert.equal(r.totals.usage?.cacheTokens, 50);
    assert.deepEqual(r.totals.cost, { chargedCents: 1.5, rawCostCents: 2.5 });
    assert.equal(r.totals.costPending, false);
    assert.equal((await readState({ ...(await import('../src/createWorkspace.ts')).resolveWorkspacePaths('happy', root) })).agentId, 'agent-fake-1');
  });

  it('cost stays pending (not estimated) when Cursor has not reported it', async () => {
    const driver: AgentDriver = async () => result({ cost: null, costPending: true });
    const r = await runPipeline({ ...base('pending-cost'), prompt: 'x', kind: 'generate', driver, buildFn: async () => ok() });
    assert.equal(r.totals.cost, null);
    assert.equal(r.totals.costPending, true);
    assert.equal(r.runs[0]!.cost, null);
  });

  it('marks the run failed and restores files when a protected file is touched', async () => {
    let seenPrompt = '';
    const driver: AgentDriver = async ({ paths, prompt }: DriverInput) => {
      seenPrompt = prompt;
      await write(paths.workspaceDir, 'src/speedvendors/commerce.ts', '// STOLEN\n');
      await write(paths.workspaceDir, 'package.json', '{"dependencies":{"evil":"1"}}\n');
      await write(paths.workspaceDir, 'src/storefront/App.tsx', 'export default function App(){return 7}\n');
      return result();
    };
    let built = false;
    const r = await runPipeline({ ...base('tamper'), prompt: 'x', kind: 'generate', driver, buildFn: async () => ((built = true), ok()) });
    assert.equal(r.status, 'failed');
    assert.match(r.failureReason ?? '', /protected files/);
    assert.equal(r.runs[0]!.status, 'protected_files_touched');
    assert.deepEqual(r.runs[0]!.protectedViolations.map((v) => v.path), ['package.json', 'src/speedvendors/commerce.ts']);
    assert.equal(built, false, 'no build and no repair after a protected-file violation');
    assert.equal(r.runs.length, 1);
    const ws = path.join(root, 'tamper', 'workspace');
    assert.equal(await fs.readFile(path.join(ws, 'src/speedvendors/commerce.ts'), 'utf8'), '// protected commerce\n');
    assert.equal(await fs.readFile(path.join(ws, 'package.json'), 'utf8'), '{"name":"t","private":true}\n');
    // the legitimate edit is kept (nothing published either way)
    assert.match(await fs.readFile(path.join(ws, 'src/storefront/App.tsx'), 'utf8'), /return 7/);
    assert.match(seenPrompt, /<merchant_design_request>/);
    assert.match(seenPrompt, /Never modify protected commerce files/);
  });

  it('removes injected credentials and symlinks and fails the run', async () => {
    const driver: AgentDriver = async ({ paths }) => {
      await write(paths.workspaceDir, 'src/components/.env', 'KEY=1\n');
      await fs.symlink('/etc', path.join(paths.workspaceDir, 'public/etc'));
      return result();
    };
    const r = await runPipeline({ ...base('creds'), prompt: 'x', kind: 'generate', driver, buildFn: async () => ok() });
    assert.equal(r.status, 'failed');
    const snap = await snapshotWorkspace(path.join(root, 'creds', 'workspace'));
    assert.deepEqual(snap.symlinks, []);
    assert.deepEqual(snap.credentialFiles, []);
  });

  it('build failure triggers exactly one repair run, then passes', async () => {
    const prompts: string[] = [];
    const driver: AgentDriver = async ({ prompt }) => {
      prompts.push(prompt);
      return result({ runId: `run-${prompts.length}` });
    };
    let n = 0;
    const r = await runPipeline({ ...base('repair-ok'), prompt: 'x', kind: 'generate', driver, buildFn: async () => (++n === 1 ? fail('src/storefront/App.tsx(3,1): error TS2304') : ok()) });
    assert.equal(r.status, 'succeeded');
    assert.deepEqual(r.runs.map((x) => x.kind), ['generate', 'repair']);
    assert.match(prompts[1]!, /<build_output>[\s\S]*TS2304/);
    assert.equal(r.totals.usage?.totalTokens, 400, 'usage summed across both runs');
  });

  it('stops after the second build failure (no unlimited repair loop)', async () => {
    let calls = 0;
    const driver: AgentDriver = async () => (calls++, result({ runId: `run-${calls}` }));
    let builds = 0;
    const r = await runPipeline({ ...base('repair-fail'), prompt: 'x', kind: 'generate', driver, buildFn: async () => (builds++, fail()) });
    assert.equal(r.status, 'failed');
    assert.equal(calls, 2, 'one generation + one repair, never more');
    assert.equal(builds, 2);
    assert.match(r.failureReason ?? '', /after the allowed repair/);
    assert.equal(r.finalBuild.status, 'failed');
  });

  it('does not build or repair when the agent run errors, times out, or is cancelled', async () => {
    for (const status of ['error', 'timeout', 'cancelled'] as const) {
      let builds = 0;
      const driver: AgentDriver = async () => result({ status, errorMessage: 'boom' });
      const r = await runPipeline({ ...base(`st-${status}`), prompt: 'x', kind: 'generate', driver, buildFn: async () => (builds++, ok()) });
      assert.equal(r.status, 'failed', status);
      assert.equal(builds, 0, status);
      assert.equal(r.runs.length, 1, status);
      assert.equal(r.runs[0]!.build.status, 'not_run');
    }
  });

  it('turns a driver exception into a failed run with a sanitised message', async () => {
    const driver: AgentDriver = async () => {
      throw new Error('network down at CURSOR_API_KEY=crsr_abcdefghijklmnop0123');
    };
    const r = await runPipeline({ ...base('throws'), prompt: 'x', kind: 'generate', driver, buildFn: async () => ok() });
    assert.equal(r.status, 'failed');
    assert.ok(!JSON.stringify(r).includes('crsr_abcdefghijklmnop0123'));
  });

  it('propagates a missing API key instead of swallowing it', async () => {
    const driver: AgentDriver = async () => {
      throw new MissingApiKeyError();
    };
    await assert.rejects(runPipeline({ ...base('nokey'), prompt: 'x', kind: 'generate', driver, buildFn: async () => ok() }), MissingApiKeyError);
  });

  it('follow-up reuses the recorded agent id and requires an existing workspace', async () => {
    await assert.rejects(runPipeline({ ...base('nope'), prompt: 'x', kind: 'followup', driver: async () => result(), buildFn: async () => ok() }), SafetyError);
    const seen: (string | null)[] = [];
    const driver: AgentDriver = async ({ agentId }) => (seen.push(agentId), result());
    await runPipeline({ ...base('follow'), prompt: 'first', kind: 'generate', driver, buildFn: async () => ok() });
    await runPipeline({ ...base('follow'), prompt: 'make the header transparent', kind: 'followup', driver, buildFn: async () => ok() });
    assert.deepEqual(seen, [null, 'agent-fake-1']);
    await assert.rejects(runPipeline({ ...base('follow'), prompt: 'again', kind: 'generate', driver, buildFn: async () => ok() }), /already exists/);
  });

  it('restores protected files that drifted between runs before starting the next run', async () => {
    await runPipeline({ ...base('drift'), prompt: 'a', kind: 'generate', driver: async () => result(), buildFn: async () => ok() });
    await write(path.join(root, 'drift', 'workspace'), 'src/main.tsx', '// tampered between runs\n');
    const r = await runPipeline({ ...base('drift'), prompt: 'b', kind: 'followup', driver: async () => result(), buildFn: async () => ok() });
    assert.match(r.runs[0]!.notes.join(' '), /drifted/);
    assert.equal(await fs.readFile(path.join(root, 'drift', 'workspace/src/main.tsx'), 'utf8'), '// protected\n');
  });

  it('validates the prompt before creating anything', async () => {
    await assert.rejects(runPipeline({ ...base('badprompt'), prompt: '   ', kind: 'generate', driver: async () => result() }), SafetyError);
    await assert.rejects(runPipeline({ ...base('badprompt'), prompt: 'x'.repeat(5000), kind: 'generate', driver: async () => result() }), SafetyError);
    await assert.rejects(fs.access(path.join(root, 'badprompt')));
  });

  it('persists a report outside the workspace', async () => {
    const runs = await fs.readdir(path.join(root, 'happy', 'runs'));
    assert.equal(runs.length, 1);
    const saved = JSON.parse(await fs.readFile(path.join(root, 'happy', 'runs', runs[0]!), 'utf8'));
    assert.equal(saved.status, 'succeeded');
    assert.equal(saved.autoPublished, false);
  });
});
