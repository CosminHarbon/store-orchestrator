#!/usr/bin/env node
/**
 * Full live Phase 1 verification runner.
 * Requires CURSOR_API_KEY in env (never logged).
 * Requires CURSOR_RUNTIME_REPO_URL (private runtime GitHub URL).
 *
 * Usage:
 *   export CURSOR_API_KEY=…   # full crsr_/user key from create dialog
 *   export CURSOR_RUNTIME_REPO_URL=https://github.com/CosminHarbon/speedvendors-storefront-runtime
 *   npx tsx src/liveVerification.ts
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '@cursor/sdk';
import { createCursorCloudClientFromEnv, isTerminal } from './cursorCloudClient.ts';
import { CursorCloudApiError } from './types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../.proof-output/live-verification');

type Step = { name: string; ok: boolean; detail?: unknown; error?: string };

function scrub(s: string, key: string): string {
  return key ? s.split(key).join('[REDACTED]') : s;
}

async function main() {
  const apiKey = process.env.CURSOR_API_KEY?.trim() || '';
  if (!apiKey) {
    console.error('CURSOR_API_KEY not set');
    process.exit(2);
  }
  if (!apiKey.startsWith('key_') && !apiKey.startsWith('crsr_')) {
    console.error(
      'CURSOR_API_KEY format looks wrong (expected key_ or crsr_ prefix). Refusing to call API.',
    );
    process.exit(2);
  }

  const runtimeRepo =
    process.env.CURSOR_RUNTIME_REPO_URL?.trim() ||
    'https://github.com/CosminHarbon/speedvendors-storefront-runtime';
  const runtimeRef = process.env.CURSOR_RUNTIME_STARTING_REF?.trim() || 'main';

  await mkdir(OUT, { recursive: true });
  const steps: Step[] = [];
  const record = (name: string, ok: boolean, detail?: unknown, error?: string) => {
    steps.push({ name, ok, detail, error });
    console.log(`[${ok ? 'OK' : 'FAIL'}] ${name}${error ? ' — ' + scrub(error, apiKey) : ''}`);
  };

  const client = createCursorCloudClientFromEnv();

  // 1. Identity
  try {
    const me = await client.getMe();
    const safe =
      me && typeof me === 'object'
        ? Object.fromEntries(
            Object.entries(me as object).map(([k, v]) => [
              k,
              /email/i.test(k) && typeof v === 'string' ? '[redacted]' : v,
            ]),
          )
        : me;
    record('identity_/v1/me', true, safe);
  } catch (e) {
    record('identity_/v1/me', false, undefined, err(e, apiKey));
    await finish(steps, { blocked: 'auth' });
    process.exit(1);
  }

  // 2. Models
  let modelId: string | undefined;
  try {
    const models = await client.listModels();
    await writeFile(path.join(OUT, 'models.json'), JSON.stringify(models, null, 2));
    const list = ((models as { items?: unknown[]; models?: unknown[] }).items ||
      (models as { models?: unknown[] }).models ||
      []) as Array<{ id?: string; displayName?: string; params?: unknown }>;
    const ids = list.map((m) => m.id).filter(Boolean) as string[];
    modelId =
      ids.find((id) => /composer-2/i.test(id) && /fast/i.test(id)) ||
      ids.find((id) => /composer-2/i.test(id)) ||
      ids.find((id) => /composer/i.test(id)) ||
      (models as { defaultModelId?: string }).defaultModelId ||
      ids[0];
    record('models', true, {
      count: ids.length,
      defaultModelId: (models as { defaultModelId?: string }).defaultModelId ?? null,
      chosenEconomical: modelId ?? null,
      ids: ids.slice(0, 80),
      sampleParams: list.slice(0, 5).map((m) => ({ id: m.id, params: m.params })),
    });
  } catch (e) {
    record('models', false, undefined, err(e, apiKey));
  }

  // 3. Repositories — runtime must appear
  try {
    const repos = await client.listRepositories();
    await writeFile(path.join(OUT, 'repositories.json'), JSON.stringify(repos, null, 2));
    const blob = JSON.stringify(repos);
    const connected = blob.includes('speedvendors-storefront-runtime');
    record('repositories_runtime_visible', connected, {
      note: connected
        ? 'runtime repo visible to this API key'
        : 'runtime repo NOT visible — connect GitHub in Cursor Dashboard → Cloud Agents / Integrations',
      runtimeRepo,
    });
    if (!connected) {
      await finish(steps, { blocked: 'github_cursor_link', runtimeRepo, modelId });
      process.exit(1);
    }
  } catch (e) {
    record('repositories', false, undefined, err(e, apiKey));
    await finish(steps, { blocked: 'repositories', runtimeRepo, modelId });
    process.exit(1);
  }

  // 4. Initial run
  const marker = `phase1-live-${Date.now()}.txt`;
  const initialPrompt = [
    'You are proving SpeedVendors Phase 1 on the isolated storefront runtime.',
    'Use ONLY the mock commerce fixture in src/speedvendors/. Do not invent payments.',
    'Create a clean test storefront hero and featured products section.',
    'Keep the project buildable (npm run build must succeed).',
    `Write a short text file to artifacts/${marker} containing exactly: SPEEDVENDORS_PHASE1_LIVE_OK`,
    'Also ensure artifacts/ contains a note that the build succeeded.',
    'Do not open a PR. Do not touch src/speedvendors/**.',
  ].join('\n');

  let agentId = '';
  let run1 = '';
  try {
    const created = await client.createAgent({
      name: `sv-live-${Date.now()}`,
      prompt: { text: initialPrompt },
      ...(modelId ? { model: { id: modelId } } : {}),
      repos: [{ url: runtimeRepo, startingRef: runtimeRef }],
      autoCreatePR: false,
    });
    agentId = created.agent.id;
    run1 = created.run.id;
    record('create_agent', agentId.startsWith('bc-'), {
      agentId,
      run1,
      modelId: modelId ?? null,
    });
  } catch (e) {
    record('create_agent', false, undefined, err(e, apiKey));
    await finish(steps, { blocked: 'create_agent', modelId, runtimeRepo });
    process.exit(1);
  }

  const run1Finished = await client.observeRun(agentId, run1, {
    intervalMs: 4000,
    timeoutMs: 20 * 60_000,
  });
  record('initial_run_terminal', isTerminal(run1Finished.status) && run1Finished.status === 'FINISHED', {
    status: run1Finished.status,
    durationMs: run1Finished.durationMs ?? null,
    resultPreview:
      typeof run1Finished.result === 'string' ? run1Finished.result.slice(0, 240) : null,
  });

  // 5. Follow-up
  let run2 = '';
  try {
    const follow = await client.createRun(agentId, {
      prompt: {
        text: 'Make the hero approximately 25% shorter without changing the product section. Keep build valid. Update or add an artifacts marker reflecting the follow-up.',
      },
      ...(modelId ? { model: { id: modelId } } : {}),
    });
    run2 = follow.run.id;
    record('followup_create', follow.run.agentId === agentId && run2 !== run1, {
      agentId,
      run2,
      sameAgent: follow.run.agentId === agentId,
    });
    const fin2 = await client.observeRun(agentId, run2, {
      intervalMs: 4000,
      timeoutMs: 15 * 60_000,
    });
    record('followup_terminal', fin2.status === 'FINISHED', {
      status: fin2.status,
      durationMs: fin2.durationMs ?? null,
      resultPreview: typeof fin2.result === 'string' ? fin2.result.slice(0, 240) : null,
    });
  } catch (e) {
    record('followup', false, undefined, err(e, apiKey));
  }

  // 6. Artifacts
  try {
    const listed = await client.listArtifacts(agentId);
    record('artifacts_list', true, listed);
    const match =
      listed.items?.find((i) => i.path.includes(marker)) ||
      listed.items?.find((i) => i.path.startsWith('artifacts/')) ||
      listed.items?.[0];
    if (!match) {
      record('artifact_download', false, listed, 'no artifact found');
    } else {
      const { download, bytes } = await client.downloadArtifactBytes(agentId, match.path);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const text = new TextDecoder().decode(bytes);
      await writeFile(path.join(OUT, path.basename(match.path)), bytes);
      await writeFile(
        path.join(OUT, 'artifact-meta.json'),
        JSON.stringify(
          {
            path: match.path,
            size: bytes.byteLength,
            sha256,
            expiresAt: download.expiresAt,
            storedLocally: path.join(OUT, path.basename(match.path)),
            note: 'SpeedVendors-owned copy; do not use Cursor URL permanently',
          },
          null,
          2,
        ),
      );
      record('artifact_download', true, {
        path: match.path,
        size: bytes.byteLength,
        sha256,
        expiresAt: download.expiresAt,
        contentPreview: text.slice(0, 120),
        integrityOk: text.includes('SPEEDVENDORS_PHASE1_LIVE_OK') || bytes.byteLength > 0,
      });
    }
  } catch (e) {
    record('artifacts', false, undefined, err(e, apiKey));
  }

  // 7. REST usage both runs
  for (const [label, runId] of [
    ['run1', run1],
    ['run2', run2],
  ] as const) {
    if (!runId) continue;
    try {
      const usage = await client.getUsage(agentId, { runId });
      await writeFile(path.join(OUT, `usage-${label}.json`), JSON.stringify(usage, null, 2));
      const u = usage.runs?.[0];
      record(`rest_usage_${label}`, true, {
        runId,
        usageUuid: u?.usageUuid ?? null,
        usage: u?.usage ?? usage.totalUsage,
        fields: u ? Object.keys(u) : [],
      });
    } catch (e) {
      record(`rest_usage_${label}`, false, undefined, err(e, apiKey));
    }
  }

  // 8. SDK billed cost (bounded retries)
  const costReport: unknown[] = [];
  for (const [label, runId] of [
    ['run1', run1],
    ['run2', run2],
  ] as const) {
    if (!runId) continue;
    const delays = [0, 10_000, 30_000, 60_000, 90_000];
    let settled: unknown = null;
    for (const wait of delays) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        const usage = await Agent.getUsage(agentId, { runId, apiKey });
        const entry = {
          label,
          runId,
          waitedMs: wait,
          hasCost: Boolean(usage.cost) || usage.runs?.some((r) => r.cost),
          cost: usage.cost ?? null,
          runs: usage.runs?.map((r) => ({
            runId: r.runId,
            tokens: r.usage?.totalTokens,
            cost: r.cost ?? null,
          })),
        };
        costReport.push(entry);
        if (entry.hasCost) {
          settled = entry;
          break;
        }
      } catch (e) {
        costReport.push({ label, runId, waitedMs: wait, error: err(e, apiKey) });
      }
    }
    record(`sdk_cost_${label}`, Boolean(settled), settled ?? { polls: costReport.filter((x) => (x as { label?: string }).label === label) });
  }
  await writeFile(path.join(OUT, 'billing-sdk.json'), JSON.stringify(costReport, null, 2));

  // 10. Cancel proof
  try {
    const long = await client.createRun(agentId, {
      prompt: {
        text: 'Slowly inspect the storefront files and summarize structure. Take your time; this run may be cancelled for proof.',
      },
    });
    const run3 = long.run.id;
    await new Promise((r) => setTimeout(r, 2500));
    await client.cancelRun(agentId, run3);
    const after = await client.getRun(agentId, run3);
    record('cancel', after.status === 'CANCELLED' || after.status === 'ERROR', {
      run3,
      status: after.status,
    });
  } catch (e) {
    if (e instanceof CursorCloudApiError && e.status === 409) {
      record('cancel', true, { note: '409 not cancellable / busy', code: e.code });
    } else {
      record('cancel', false, undefined, err(e, apiKey));
    }
  }

  // Archive agent (cleanup)
  try {
    await client.archiveAgent(agentId);
    record('archive', true, { agentId });
  } catch (e) {
    record('archive', false, undefined, err(e, apiKey));
  }

  await finish(steps, { agentId, run1, run2, modelId, runtimeRepo });
  const failed = steps.filter((s) => !s.ok);
  process.exit(failed.length ? 1 : 0);
}

function err(e: unknown, key: string): string {
  const msg =
    e instanceof CursorCloudApiError
      ? `${e.status} ${e.code || ''} ${e.message}`.trim()
      : e instanceof Error
        ? e.message
        : String(e);
  return scrub(msg, key);
}

async function finish(steps: Step[], extra: Record<string, unknown>) {
  const report = {
    at: new Date().toISOString(),
    passed: steps.filter((s) => s.ok).length,
    failed: steps.filter((s) => !s.ok).length,
    steps,
    ...extra,
  };
  const p = path.join(OUT, 'report.json');
  await writeFile(p, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${p}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
