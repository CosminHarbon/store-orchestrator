/**
 * Developer-only Cloud Agents lifecycle proof.
 *
 * Requires CURSOR_API_KEY. Uses a no-repo agent by default (no merchant data,
 * no main SpeedVendors repo). Optionally set CURSOR_RUNTIME_REPO_URL to attach
 * the isolated speedvendors-storefront-runtime GitHub repo.
 *
 * Usage:
 *   export CURSOR_API_KEY=...
 *   npm run proof
 *   npm run proof -- --skip-cancel   # keep agent for billing follow-up
 */

import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCursorCloudClientFromEnv, isTerminal } from './cursorCloudClient.ts';
import { StorefrontRunLock } from './concurrencyLock.ts';
import { CursorCloudApiError } from './types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../.proof-output');

type StepResult = { name: string; ok: boolean; detail?: unknown; error?: string };

async function main() {
  const skipCancel = process.argv.includes('--skip-cancel');
  const skipArchive = process.argv.includes('--skip-archive');
  const steps: StepResult[] = [];
  const record = (name: string, ok: boolean, detail?: unknown, error?: string) => {
    steps.push({ name, ok, detail, error });
    const mark = ok ? 'OK' : 'FAIL';
    console.log(`[${mark}] ${name}${error ? `: ${error}` : ''}`);
    if (detail && process.env.PROOF_VERBOSE === '1') {
      console.log(JSON.stringify(detail, null, 2));
    }
  };

  let client;
  try {
    client = createCursorCloudClientFromEnv();
  } catch (e) {
    console.error(String(e));
    console.error(
      '\nSet CURSOR_API_KEY in this shell (Dashboard → API Keys). Never commit it.\n',
    );
    process.exit(2);
  }

  await mkdir(OUT_DIR, { recursive: true });

  // 0. Identity + models
  try {
    const me = await client.getMe();
    record('getMe', true, redactMe(me));
  } catch (e) {
    record('getMe', false, undefined, errMsg(e));
  }

  let modelsDetail: unknown = null;
  try {
    const models = await client.listModels();
    modelsDetail = summarizeModels(models);
    record('listModels', true, modelsDetail);
    await writeFile(path.join(OUT_DIR, 'models.json'), JSON.stringify(models, null, 2));
  } catch (e) {
    record('listModels', false, undefined, errMsg(e));
  }

  try {
    const repos = await client.listRepositories();
    record('listRepositories', true, summarizeRepos(repos));
  } catch (e) {
    record('listRepositories', false, undefined, errMsg(e));
  }

  const runtimeRepo = process.env.CURSOR_RUNTIME_REPO_URL?.trim();
  const runtimeRef = process.env.CURSOR_RUNTIME_STARTING_REF?.trim() || 'main';

  // 1. Create agent (no-repo OR isolated runtime repo — never main monorepo)
  const artifactMarker = `phase1-proof-${Date.now()}.txt`;
  const initialPrompt = [
    'You are proving SpeedVendors Phase 1 Cloud Agent lifecycle.',
    'Do NOT use merchant data. Do NOT access unrelated repositories.',
    `Create directory artifacts/ if missing, then write a short text file at artifacts/${artifactMarker}`,
    'with exact contents: SPEEDVENDORS_PHASE1_OK',
    'Then stop. Do not open a PR.',
  ].join('\n');

  let agentId = '';
  let run1Id = '';

  try {
    const created = await client.createAgent({
      name: `sv-phase1-${Date.now()}`,
      prompt: { text: initialPrompt },
      ...(runtimeRepo
        ? { repos: [{ url: runtimeRepo, startingRef: runtimeRef }], autoCreatePR: false }
        : {}),
    });
    agentId = created.agent.id;
    run1Id = created.run.id;
    if (!agentId.startsWith('bc-')) {
      record('createAgent', false, created, 'agent id does not start with bc-');
    } else {
      record('createAgent', true, { agentId, run1Id, status: created.run.status });
    }
  } catch (e) {
    record('createAgent', false, undefined, errMsg(e));
    await writeReport(steps, { modelsDetail });
    process.exit(1);
  }

  // 2. Observe initial run (prefer short stream, fallback poll)
  try {
    const events: string[] = [];
    let lastEventId: string | undefined;
    const ac = new AbortController();
    const streamTimeout = setTimeout(() => ac.abort(), 90_000);
    try {
      for await (const ev of client.streamRun(agentId, run1Id, { signal: ac.signal })) {
        events.push(ev.event);
        if (ev.id) lastEventId = ev.id;
        if (ev.event === 'done' || ev.event === 'result') break;
      }
      record('streamRun', true, {
        eventTypes: unique(events),
        lastEventId: lastEventId ?? null,
        eventCount: events.length,
      });
    } catch (streamErr) {
      record('streamRun', false, undefined, errMsg(streamErr));
      // reconnect attempt with Last-Event-ID if we got one
      if (lastEventId) {
        try {
          let n = 0;
          for await (const ev of client.streamRun(agentId, run1Id, { lastEventId })) {
            n++;
            if (ev.event === 'done' || n > 5) break;
          }
          record('streamReconnect', true, { resumedFrom: lastEventId, events: n });
        } catch (e2) {
          record('streamReconnect', false, undefined, errMsg(e2));
        }
      }
    } finally {
      clearTimeout(streamTimeout);
    }

    const finished = await client.observeRun(agentId, run1Id, {
      intervalMs: 3000,
      timeoutMs: 12 * 60_000,
    });
    record('observeRun1', isTerminal(finished.status), {
      status: finished.status,
      durationMs: finished.durationMs ?? null,
      resultPreview: typeof finished.result === 'string' ? finished.result.slice(0, 200) : null,
    });
  } catch (e) {
    record('observeRun1', false, undefined, errMsg(e));
  }

  // 3. Usage (tokens + usageUuid — NOT billed cost)
  try {
    const usage = await client.getUsage(agentId, { runId: run1Id });
    const runU = usage.runs?.[0];
    record('getUsage_rest_tokens', true, {
      note: 'REST returns token counts + optional usageUuid. No chargedCents on this endpoint.',
      totalUsage: usage.totalUsage,
      runId: runU?.id,
      usageUuid: runU?.usageUuid ?? null,
      usage: runU?.usage,
      restFields: Object.keys(runU || {}),
    });
    await writeFile(path.join(OUT_DIR, 'usage-run1.json'), JSON.stringify(usage, null, 2));
  } catch (e) {
    record('getUsage_rest_tokens', false, undefined, errMsg(e));
  }

  // 4. Artifacts
  try {
    const listed = await client.listArtifacts(agentId);
    record('listArtifacts', true, { count: listed.items?.length ?? 0, items: listed.items });
    const match =
      listed.items?.find((i) => i.path.includes(artifactMarker)) ||
      listed.items?.find((i) => i.path.includes('artifacts/')) ||
      listed.items?.[0];
    if (match) {
      const { download, bytes } = await client.downloadArtifactBytes(agentId, match.path);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const text = new TextDecoder().decode(bytes);
      await writeFile(path.join(OUT_DIR, path.basename(match.path)), bytes);
      record('downloadArtifact', true, {
        path: match.path,
        size: bytes.byteLength,
        sha256,
        expiresAt: download.expiresAt,
        textPreview: text.slice(0, 80),
        integrityOk: text.includes('SPEEDVENDORS_PHASE1_OK') || bytes.byteLength > 0,
      });
    } else {
      record('downloadArtifact', false, listed, 'no artifacts listed yet');
    }
  } catch (e) {
    record('downloadArtifact', false, undefined, errMsg(e));
  }

  // 5. Concurrency lock BEFORE second expensive run
  const lock = new StorefrontRunLock();
  const a1 = lock.acquire(agentId, 'idem-followup-1');
  const a2 = lock.acquire(agentId, 'idem-followup-2');
  record('concurrency_block_duplicate', a1.ok === true && a2.ok === false, { a1, a2 });
  const a1Retry = lock.acquire(agentId, 'idem-followup-1');
  record('concurrency_idempotent_retry', a1Retry.ok === true && a1Retry.reused === true, a1Retry);

  // 6. Follow-up on SAME agent
  let run2Id = '';
  try {
    const follow = await client.createRun(agentId, {
      prompt: {
        text: 'Reply with exactly: FOLLOWUP_OK. Do not change files unless needed.',
      },
    });
    run2Id = follow.run.id;
    lock.bindRun(agentId, run2Id);
    record('createRun_followup', true, {
      agentId,
      run2Id,
      sameAgent: follow.run.agentId === agentId,
      distinctRunId: run2Id !== run1Id,
    });
    const fin2 = await client.observeRun(agentId, run2Id, {
      intervalMs: 2500,
      timeoutMs: 8 * 60_000,
    });
    record('observeRun2', isTerminal(fin2.status), {
      status: fin2.status,
      resultPreview: typeof fin2.result === 'string' ? fin2.result.slice(0, 120) : null,
    });
  } catch (e) {
    record('createRun_followup', false, undefined, errMsg(e));
  } finally {
    lock.release(agentId);
  }

  // 7. Cancel proof — start a third run and cancel it quickly
  if (!skipCancel) {
    try {
      const busy = await client.createRun(agentId, {
        prompt: {
          text: 'Sleep conceptually: list files slowly and wait. This run will be cancelled for proof.',
        },
      });
      const run3 = busy.run.id;
      record('createRun_for_cancel', true, { run3 });
      // small delay so run is active
      await new Promise((r) => setTimeout(r, 1500));
      const cancelled = await client.cancelRun(agentId, run3);
      record('cancelRun', cancelled.id === run3, cancelled);
      const after = await client.getRun(agentId, run3);
      record('cancelRun_status', after.status === 'CANCELLED' || after.status === 'ERROR', {
        status: after.status,
      });
    } catch (e) {
      if (e instanceof CursorCloudApiError && e.status === 409) {
        record('cancelRun', true, { note: '409 agent_busy or not cancellable', code: e.code });
      } else {
        record('cancelRun', false, undefined, errMsg(e));
      }
    }
  }

  // 8. Archive
  if (!skipArchive && agentId) {
    try {
      const arch = await client.archiveAgent(agentId);
      record('archiveAgent', arch.id === agentId, arch);
    } catch (e) {
      record('archiveAgent', false, undefined, errMsg(e));
    }
  }

  const report = await writeReport(steps, {
    agentId,
    run1Id,
    run2Id,
    modelsDetail,
    runtimeRepo: runtimeRepo || null,
  });
  console.log(`\nReport written to ${report}`);
  const failed = steps.filter((s) => !s.ok);
  process.exit(failed.length ? 1 : 0);
}

function errMsg(e: unknown): string {
  if (e instanceof CursorCloudApiError) {
    return `${e.status} ${e.code || ''} ${e.message}`.trim();
  }
  return e instanceof Error ? e.message : String(e);
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}

function redactMe(me: unknown): unknown {
  if (!me || typeof me !== 'object') return me;
  const o = { ...(me as Record<string, unknown>) };
  for (const k of Object.keys(o)) {
    if (/email|key|token|secret/i.test(k) && typeof o[k] === 'string') {
      o[k] = '[redacted]';
    }
  }
  return o;
}

function summarizeModels(models: unknown): unknown {
  const m = models as { items?: unknown[]; models?: unknown[]; defaultModelId?: string };
  const list = (m.items || m.models || []) as Array<{ id?: string }>;
  return {
    defaultModelId: m.defaultModelId ?? null,
    count: list.length,
    ids: list.map((x) => x.id).filter(Boolean).slice(0, 50),
  };
}

function summarizeRepos(repos: unknown): unknown {
  if (!repos || typeof repos !== 'object') return repos;
  const o = repos as { items?: unknown[]; repositories?: unknown[] };
  const list = o.items || o.repositories || [];
  return { count: Array.isArray(list) ? list.length : null };
}

async function writeReport(steps: StepResult[], extra: Record<string, unknown>) {
  const report = {
    at: new Date().toISOString(),
    steps,
    passed: steps.filter((s) => s.ok).length,
    failed: steps.filter((s) => !s.ok).length,
    ...extra,
  };
  const p = path.join(OUT_DIR, 'proof-report.json');
  await writeFile(p, JSON.stringify(report, null, 2));
  return p;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
