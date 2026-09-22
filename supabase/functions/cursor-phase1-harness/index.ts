/**
 * Developer-only Phase 1 + Phase 2 live proof harness (short actions).
 * Auth: Authorization: Bearer <PHASE1_HARNESS_TOKEN>
 * CURSOR_API_KEY stays in Edge secrets — never returned.
 * Phase 2 modes use service role + test_user_id (no merchant JWT).
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { CursorCloudApiError, CursorCloudClient } from '../_shared/cursorCloudClient.ts';
import {
  ingestCursorArtifact,
  artifactStorageDir,
  createArtifactSignedUrl,
} from '../_shared/cursorArtifactStore.ts';
import {
  findCompanionManifestPath,
  pickArtifactPath,
} from '../_shared/cursorArtifactPaths.ts';
import {
  buildFollowupPrompt,
  buildGenerationPrompt,
} from '../_shared/cursorGenerationPrompt.ts';
import {
  loadMerchantContextFromStoreApi,
  type MerchantContextStrategy,
} from '../_shared/cursorMerchantContext.ts';
import {
  mintPreviewToken,
  PREVIEW_TOKEN_DEFAULT_TTL_SECONDS,
} from '../_shared/cursorPreviewToken.ts';

const DEFAULT_PHASE2_TEST_USER = 'f30cbfb8-eeb4-4ccf-8c95-8a8de505d7e5';
const DEFAULT_MODEL = 'composer-2.5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-harness-token, apikey',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function harnessAuthorized(req: Request): boolean {
  const expected = (Deno.env.get('PHASE1_HARNESS_TOKEN') || '').trim();
  if (!expected) return false;
  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const hdr = (req.headers.get('x-harness-token') || '').trim();
  return safeEqual(auth, expected) || safeEqual(hdr, expected);
}

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

function runtimeRepo() {
  return (
    (Deno.env.get('CURSOR_RUNTIME_REPO_URL') || '').trim() ||
    'https://github.com/CosminHarbon/speedvendors-storefront-runtime'
  );
}

function runtimeRef() {
  return (Deno.env.get('CURSOR_RUNTIME_STARTING_REF') || 'main').trim();
}

function errMsg(e: unknown): string {
  if (e instanceof CursorCloudApiError) return `${e.status} ${e.code || ''} ${e.message}`.trim();
  return e instanceof Error ? e.message : String(e);
}

function resolveTestUserId(body: Record<string, unknown>): string {
  return String(body.test_user_id || Deno.env.get('PHASE2_TEST_USER_ID') || DEFAULT_PHASE2_TEST_USER)
    .trim();
}

async function loadActiveHarnessSession(
  db: ReturnType<typeof admin>,
  testUserId: string,
  select =
    'id, status, pipeline_status, cursor_agent_id, runtime_revision, runtime_commit_sha, runtime_starting_ref, current_draft_version_id, active_run_id, last_error_category, metadata, updated_at',
) {
  const { data } = await db
    .from('cursor_storefront_sessions')
    .select(select)
    .eq('user_id', testUserId)
    .not('status', 'in', '(replaced,archived)')
    .maybeSingle();
  return data;
}

/** Shared reseed logic (mirrors gateway create_replacement_session). No Cursor agent created. */
async function createReplacementSessionRow(
  db: ReturnType<typeof admin>,
  testUserId: string,
  runtimeCommitSha: string,
  reason: string,
) {
  const old = await loadActiveHarnessSession(
    db,
    testUserId,
    'id, user_id, status, runtime_commit_sha, runtime_repo_url, runtime_starting_ref, runtime_revision, metadata, active_run_id',
  );
  if (!old) {
    // No prior session — insert a fresh active row pinned to the new SHA.
    const { data: neu, error } = await db
      .from('cursor_storefront_sessions')
      .insert({
        user_id: testUserId,
        status: 'idle',
        runtime_revision: 'phase2',
        runtime_repo_url: runtimeRepo(),
        runtime_starting_ref: runtimeCommitSha,
        runtime_commit_sha: runtimeCommitSha,
        metadata: { seed_reason: reason, harness_reseed: true },
      })
      .select('id, runtime_commit_sha')
      .single();
    if (error || !neu) throw new Error(error?.message || 'insert_failed');
    return {
      old_session_id: null as string | null,
      new_session_id: neu.id as string,
      runtime_commit_sha: neu.runtime_commit_sha as string,
      created_fresh: true,
    };
  }
  if (old.active_run_id) {
    throw new Error('run_already_active');
  }

  const { error: markErr } = await db
    .from('cursor_storefront_sessions')
    .update({
      status: 'replaced',
      replaced_at: new Date().toISOString(),
      replacement_reason: reason,
      active_run_id: null,
      pipeline_status: null,
    })
    .eq('id', old.id);
  if (markErr) throw new Error(markErr.message);

  const prevMeta =
    old.metadata && typeof old.metadata === 'object' && !Array.isArray(old.metadata)
      ? (old.metadata as Record<string, unknown>)
      : {};

  const { data: neu, error: insErr } = await db
    .from('cursor_storefront_sessions')
    .insert({
      user_id: testUserId,
      status: 'idle',
      cursor_agent_id: null,
      runtime_revision: old.runtime_revision || 'phase2',
      runtime_repo_url: old.runtime_repo_url || runtimeRepo(),
      runtime_starting_ref: runtimeCommitSha,
      runtime_commit_sha: runtimeCommitSha,
      current_draft_version_id: null,
      active_run_id: null,
      metadata: {
        ...prevMeta,
        seed_from_session_id: old.id,
        seed_from_runtime_commit_sha: old.runtime_commit_sha,
        harness_reseed: true,
      },
    })
    .select('id, runtime_commit_sha')
    .single();

  if (insErr || !neu) {
    await db
      .from('cursor_storefront_sessions')
      .update({
        status: old.status || 'ready',
        replaced_at: null,
        replacement_reason: null,
      })
      .eq('id', old.id);
    throw new Error(insErr?.message || 'insert_failed');
  }

  await db
    .from('cursor_storefront_sessions')
    .update({ replaced_by_session_id: neu.id })
    .eq('id', old.id);

  return {
    old_session_id: old.id as string,
    new_session_id: neu.id as string,
    runtime_commit_sha: neu.runtime_commit_sha as string,
    created_fresh: false,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!harnessAuthorized(req)) return json({ error: 'unauthorized' }, 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = String(body.mode || 'probe');

  // Phase 2 status/context do not require Cursor for all paths; still init when needed.
  const needsCursor = ![
    'claim_only',
    'release',
    'entitlement_probe',
    'phase2_status',
    'phase2_context',
    'phase2_reseed',
    'phase2_simulate_artifact_failure',
    'phase2_preview_token',
  ].includes(mode);

  let cursor: CursorCloudClient | null = null;
  if (needsCursor || mode.startsWith('phase2_')) {
    try {
      cursor = CursorCloudClient.fromEnv();
    } catch {
      if (
        [
          'phase2_start',
          'phase2_poll',
          'phase2_complete',
          'phase2_followup',
          'probe',
          'create',
          'get_run',
          'followup',
          'persist_usage',
          'artifacts',
          'download_artifact',
          'usage',
          'cancel_probe',
          'archive',
        ].includes(mode)
      ) {
        return json({ error: 'cursor_not_configured' }, 503);
      }
    }
  }

  try {
    switch (mode) {
      case 'probe':
        return await handleProbe(cursor!);
      case 'create':
        return await handleCreate(cursor!, body);
      case 'get_run':
        return await handleGetRun(cursor!, body);
      case 'followup':
        return await handleFollowup(cursor!, body);
      case 'claim_only':
        return await handleClaimOnly(body);
      case 'persist_usage':
        return await handlePersistUsage(cursor!, body);
      case 'release':
        return await handleRelease(body);
      case 'artifacts':
        return await handleArtifacts(cursor!, body);
      case 'download_artifact':
        return await handleDownloadArtifact(cursor!, body);
      case 'usage':
        return await handleUsage(cursor!, body);
      case 'cancel_probe':
        return await handleCancel(cursor!, body);
      case 'entitlement_probe':
        return await handleEntitlement(body);
      case 'archive':
        return await handleArchive(cursor!, body);
      case 'phase2_context':
        return await handlePhase2Context(body);
      case 'phase2_start':
        return await handlePhase2Start(cursor!, body);
      case 'phase2_poll':
        return await handlePhase2Poll(cursor!, body);
      case 'phase2_complete':
        return await handlePhase2Complete(cursor!, body);
      case 'phase2_followup':
        return await handlePhase2Followup(cursor!, body);
      case 'phase2_status':
        return await handlePhase2Status(body);
      case 'phase2_reseed':
        return await handlePhase2Reseed(body);
      case 'phase2_simulate_artifact_failure':
        return await handlePhase2SimulateArtifactFailure(body);
      case 'phase2_preview_token':
        return await handlePhase2PreviewToken(body);
      default:
        return json({ error: 'unknown_mode' }, 400);
    }
  } catch (e) {
    return json({ error: errMsg(e) }, 502);
  }
});

async function handleProbe(cursor: CursorCloudClient) {
  const steps: Array<{ name: string; ok: boolean; detail?: unknown; error?: string }> = [];
  try {
    const me = (await cursor.getMe()) as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(me || {})) {
      safe[k] = /email/i.test(k) && typeof v === 'string' ? '[redacted]' : v;
    }
    steps.push({ name: 'identity', ok: true, detail: safe });
  } catch (e) {
    steps.push({ name: 'identity', ok: false, error: errMsg(e) });
  }

  try {
    const models = (await cursor.listModels()) as {
      items?: Array<{ id?: string; params?: unknown; aliases?: string[] }>;
      models?: Array<{ id?: string }>;
      defaultModelId?: string;
    };
    const list = models.items || models.models || [];
    const ids = list.map((m) => m.id).filter(Boolean) as string[];
    const chosen =
      ids.find((id) => /composer-2\.5/i.test(id)) ||
      ids.find((id) => /composer-2/i.test(id)) ||
      ids.find((id) => /composer/i.test(id)) ||
      models.defaultModelId ||
      ids[0];
    steps.push({
      name: 'models',
      ok: true,
      detail: {
        count: ids.length,
        defaultModelId: models.defaultModelId ?? null,
        chosen,
        ids,
        sample: list.slice(0, 12).map((m) => ({
          id: m.id,
          params: (m as { params?: unknown }).params,
          aliases: (m as { aliases?: string[] }).aliases,
        })),
      },
    });
  } catch (e) {
    steps.push({ name: 'models', ok: false, error: errMsg(e) });
  }

  try {
    const repos = await cursor.listRepositories();
    const blob = JSON.stringify(repos);
    const o = repos as { items?: Array<{ url?: string }> };
    const list = o.items || [];
    steps.push({
      name: 'repositories',
      ok: blob.includes('speedvendors-storefront-runtime'),
      detail: {
        runtimeVisible: blob.includes('speedvendors-storefront-runtime'),
        preview: { count: list.length, urls: list.map((r) => r.url).filter(Boolean) },
      },
    });
  } catch (e) {
    steps.push({ name: 'repositories', ok: false, error: errMsg(e) });
  }

  return json({ mode: 'probe', steps });
}

async function handleCreate(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const testUserId = String(body.test_user_id || '');
  const prompt = String(body.prompt || '');
  const model = body.model ? String(body.model) : undefined;
  if (!testUserId || !prompt) return json({ error: 'test_user_id_and_prompt_required' }, 400);

  const db = admin();
  await db.from('cursor_ai_entitlements').upsert(
    {
      user_id: testUserId,
      plan_kind: 'trial',
      enabled: true,
      backend_feature_enabled: true,
      budget_cents: 200,
      max_runs: 50,
      metadata: { phase1_harness: true },
    },
    { onConflict: 'user_id' },
  );
  await db
    .from('cursor_storefront_sessions')
    .update({ active_run_id: null, status: 'ready' })
    .eq('user_id', testUserId);

  const created = await cursor.createAgent({
    name: `sv-live-${Date.now()}`,
    prompt: { text: prompt },
    ...(model ? { model: { id: model } } : {}),
    repos: [{ url: runtimeRepo(), startingRef: runtimeRef() }],
    autoCreatePR: false,
  });

  const { data: sess } = await db
    .from('cursor_storefront_sessions')
    .upsert(
      {
        user_id: testUserId,
        cursor_agent_id: created.agent.id,
        status: 'running',
        runtime_revision: 'phase1',
        runtime_repo_url: runtimeRepo(),
        runtime_starting_ref: runtimeRef(),
      },
      { onConflict: 'user_id' },
    )
    .select('id')
    .single();

  const { data: runRow } = await db
    .from('cursor_storefront_runs')
    .insert({
      session_id: sess?.id,
      user_id: testUserId,
      cursor_run_id: created.run.id,
      run_type: 'initial',
      status: 'running',
      idempotency_key: `live-initial-${created.run.id}`,
      prompt,
      model: model ?? null,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (sess?.id && runRow?.id) {
    await db.from('cursor_storefront_sessions').update({ active_run_id: runRow.id }).eq('id', sess.id);
  }

  return json({
    agentId: created.agent.id,
    runId: created.run.id,
    dbRunId: runRow?.id ?? null,
    sessionId: sess?.id ?? null,
    model: model ?? null,
  });
}

async function handleGetRun(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const agentId = String(body.agentId || '');
  const runId = String(body.runId || '');
  const run = await cursor.getRun(agentId, runId);
  return json({
    id: run.id,
    agentId: run.agentId,
    status: run.status,
    durationMs: (run as { durationMs?: number }).durationMs ?? null,
    resultPreview: typeof run.result === 'string' ? run.result.slice(0, 300) : null,
  });
}

async function handleFollowup(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const testUserId = String(body.test_user_id || '');
  const agentId = String(body.agentId || '');
  const prompt = String(body.prompt || '');
  const model = body.model ? String(body.model) : undefined;
  if (!testUserId || !agentId || !prompt) return json({ error: 'missing_args' }, 400);

  const db = admin();
  await db
    .from('cursor_storefront_sessions')
    .update({ active_run_id: null, status: 'ready' })
    .eq('user_id', testUserId);

  const follow = await cursor.createRun(agentId, {
    prompt: { text: prompt },
    ...(model ? { model: { id: model } } : {}),
  });

  const { data: sess } = await db
    .from('cursor_storefront_sessions')
    .select('id')
    .eq('user_id', testUserId)
    .maybeSingle();

  const { data: runRow } = await db
    .from('cursor_storefront_runs')
    .insert({
      session_id: sess?.id,
      user_id: testUserId,
      cursor_run_id: follow.run.id,
      run_type: 'followup',
      status: 'running',
      idempotency_key: `live-followup-${follow.run.id}`,
      prompt,
      model: model ?? null,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (sess?.id && runRow?.id) {
    await db
      .from('cursor_storefront_sessions')
      .update({ active_run_id: runRow.id, status: 'running', cursor_agent_id: agentId })
      .eq('id', sess.id);
  }

  return json({
    agentId: follow.run.agentId,
    runId: follow.run.id,
    dbRunId: runRow?.id ?? null,
  });
}

async function handleClaimOnly(body: Record<string, unknown>) {
  const db = admin();
  const { data } = await db.rpc('cursor_ai_claim_run', {
    p_user_id: String(body.test_user_id || ''),
    p_idempotency_key: String(body.idempotency_key || ''),
    p_run_type: 'followup',
    p_prompt: String(body.prompt || 'block'),
    p_model: null,
  });
  return json(data ?? { ok: false });
}

async function handlePersistUsage(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const agentId = String(body.agentId || '');
  const runId = String(body.runId || '');
  const dbRunId = String(body.dbRunId || '');
  const status = String(body.status || 'finished').toLowerCase();
  if (!dbRunId) return json({ ok: false, error: 'dbRunId_required' }, 400);

  const usage = await cursor.getUsage(agentId, runId);
  const runs = (usage as { runs?: Array<Record<string, unknown>> }).runs || [];
  const u = runs[0] || {};
  const usageObj = (u.usage || {}) as Record<string, number>;
  const cost = (u.cost || null) as { chargedCents?: number; rawCostCents?: number } | null;

  await admin()
    .from('cursor_storefront_runs')
    .update({
      status: status === 'finished' ? 'finished' : status,
      input_tokens: usageObj.inputTokens ?? null,
      output_tokens: usageObj.outputTokens ?? null,
      cache_write_tokens: usageObj.cacheWriteTokens ?? null,
      cache_read_tokens: usageObj.cacheReadTokens ?? null,
      total_tokens: usageObj.totalTokens ?? null,
      usage_uuid: (u.usageUuid as string) ?? null,
      actual_charged_cents: cost?.chargedCents ?? null,
      actual_raw_cost_cents: cost?.rawCostCents ?? null,
      cost_reconciliation_status: cost ? 'reconciled' : 'tokens_only',
      finished_at: new Date().toISOString(),
    })
    .eq('id', dbRunId);

  return json({ ok: true, usage });
}

async function handleRelease(body: Record<string, unknown>) {
  await admin().rpc('cursor_ai_release_run', {
    p_run_id: String(body.dbRunId || ''),
    p_status: String(body.status || 'finished'),
    p_cursor_run_id: body.cursorRunId ? String(body.cursorRunId) : null,
  });
  return json({ ok: true });
}

async function handleArtifacts(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const agentId = String(body.agentId || '');
  const testUserId = String(body.test_user_id || '');
  const listed = await cursor.listArtifactsWithRetry(agentId);
  const match =
    listed.items?.find((i) => i.path.includes('phase1-live')) ||
    listed.items?.find((i) => i.path.startsWith('artifacts/')) ||
    listed.items?.[0];
  const path = match?.path || 'artifacts/phase1-live-marker.txt';
  if (!match && !(listed.items && listed.items.length > 0)) {
    try {
      return await captureArtifact(cursor, {
        agentId,
        testUserId,
        path,
        dbRunId: body.dbRunId ? String(body.dbRunId) : null,
      });
    } catch (e) {
      return json({ ok: false, error: 'no_artifact', items: listed.items, detail: errMsg(e) });
    }
  }
  if (!match) return json({ ok: false, error: 'no_artifact', items: listed.items });

  return await captureArtifact(cursor, {
    agentId,
    testUserId,
    path: match.path,
    dbRunId: body.dbRunId ? String(body.dbRunId) : null,
  });
}

async function handleDownloadArtifact(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const agentId = String(body.agentId || '');
  const testUserId = String(body.test_user_id || '');
  const path = String(body.path || 'artifacts/phase1-live-marker.txt');
  const listed = await cursor.listArtifactsWithRetry(agentId);
  try {
    const captured = await captureArtifact(cursor, {
      agentId,
      testUserId,
      path,
      dbRunId: body.dbRunId ? String(body.dbRunId) : null,
    });
    return captured;
  } catch (e) {
    return json({
      ok: false,
      error: errMsg(e),
      path,
      listItems: listed.items ?? [],
    });
  }
}

async function captureArtifact(
  cursor: CursorCloudClient,
  args: { agentId: string; testUserId: string; path: string; dbRunId: string | null },
) {
  const dl = await cursor.getArtifactDownload(args.agentId, args.path);
  const res = await fetch(dl.url);
  if (!res.ok) {
    return json({
      ok: false,
      error: `download_http_${res.status}`,
      path: args.path,
      expiresAt: dl.expiresAt,
    });
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const text = new TextDecoder().decode(buf);

  const db = admin();
  const { data: sess } = await db
    .from('cursor_storefront_sessions')
    .select('id')
    .eq('user_id', args.testUserId)
    .maybeSingle();
  const { count } = await db
    .from('cursor_storefront_versions')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sess?.id);
  await db.from('cursor_storefront_versions').insert({
    session_id: sess?.id,
    user_id: args.testUserId,
    run_id: args.dbRunId,
    version_number: (count ?? 0) + 1,
    cursor_artifact_path: args.path,
    content_sha256: sha,
    content_size_bytes: buf.byteLength,
    status: 'captured',
    metadata: {
      expires_at: dl.expiresAt,
      note: 'sv_owned_copy_required',
      preview: text.slice(0, 80),
    },
  });

  return json({
    ok: true,
    path: args.path,
    size: buf.byteLength,
    sha256: sha,
    expiresAt: dl.expiresAt,
    integrityOk: text.includes('SPEEDVENDORS_PHASE1_LIVE_OK') || buf.byteLength > 0,
    preview: text.slice(0, 120),
  });
}

async function handleUsage(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const usage = await cursor.getUsage(String(body.agentId || ''), String(body.runId || '') || undefined);
  return json({ ok: true, usage });
}

async function handleCancel(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const agentId = String(body.agentId || '');

  if (body.runId) {
    const runId = String(body.runId);
    try {
      await cursor.cancelRun(agentId, runId);
    } catch (e) {
      if (!(e instanceof CursorCloudApiError && (e.status === 409 || e.status === 400))) throw e;
    }
    const after = await cursor.getRun(agentId, runId);
    return json({ ok: true, runId, status: after.status, cancelIssued: true });
  }

  const long = await cursor.createRun(agentId, {
    prompt: {
      text:
        'Spend several minutes carefully reading every file under src/ and summarizing line by line. ' +
        'Do not finish quickly. This run will be cancelled mid-flight for a proof.',
    },
  });
  await new Promise((r) => setTimeout(r, 2000));
  try {
    await cursor.cancelRun(agentId, long.run.id);
  } catch (e) {
    if (!(e instanceof CursorCloudApiError && (e.status === 409 || e.status === 400))) throw e;
  }
  const after = await cursor.getRun(agentId, long.run.id);
  return json({
    ok: true,
    runId: long.run.id,
    status: after.status,
    cancelIssued: true,
  });
}

async function handleEntitlement(body: Record<string, unknown>) {
  const testUserId = String(body.test_user_id || '');
  const db = admin();
  await db.from('cursor_ai_entitlements').update({ enabled: false }).eq('user_id', testUserId);
  const { data: denied } = await db.rpc('cursor_ai_may_start_run', { p_user_id: testUserId });
  await db
    .from('cursor_ai_entitlements')
    .update({ enabled: true, backend_feature_enabled: true })
    .eq('user_id', testUserId);
  const { data: allowed } = await db.rpc('cursor_ai_may_start_run', { p_user_id: testUserId });
  return json({
    ok: denied?.allowed === false && allowed?.allowed === true,
    denied,
    allowed,
  });
}

async function handleArchive(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const agentId = String(body.agentId || '');
  await cursor.archiveAgent(agentId);
  await admin()
    .from('cursor_storefront_sessions')
    .update({ status: 'archived', active_run_id: null })
    .eq('user_id', String(body.test_user_id || ''));
  return json({ ok: true, agentId });
}

// ─── Phase 2 developer modes (service role + test_user_id) ─────────────────

async function ensurePhase2Entitlement(db: ReturnType<typeof admin>, testUserId: string) {
  await db.from('cursor_ai_entitlements').upsert(
    {
      user_id: testUserId,
      plan_kind: 'trial',
      enabled: true,
      backend_feature_enabled: true,
      budget_cents: 500,
      max_runs: 50,
      metadata: { phase2_harness: true },
    },
    { onConflict: 'user_id' },
  );
}

async function handlePhase2Context(body: Record<string, unknown>) {
  const testUserId = resolveTestUserId(body);
  const db = admin();
  const strategy: MerchantContextStrategy = {};
  if (typeof body.max_products === 'number') strategy.maxProducts = body.max_products;
  if (Array.isArray(body.featured_ids)) {
    strategy.featuredIds = body.featured_ids.map(String);
  }

  try {
    const { context, chars, source } = await loadMerchantContextFromStoreApi({
      admin: db as never,
      userId: testUserId,
      strategy,
    });

    const sampleProductIds = (context.products || []).slice(0, 5).map((p) => p.id);
    const preview = {
      storeName: context.store?.name ?? null,
      locale: context.store?.locale ?? null,
      currency: context.store?.currency ?? null,
      sampleTitles: (context.products || []).slice(0, 3).map((p) => p.title),
      sampleCollectionNames: (context.categories || []).slice(0, 3).map((c) => c.name),
    };

    return json({
      mode: 'phase2_context',
      ok: true,
      chars,
      productCount: context.products?.length ?? 0,
      collectionCount: context.categories?.length ?? 0,
      sampleProductIds,
      source,
      // Truncated preview only — never dump full context / PII.
      preview,
      proofHint: '.proof-output/phase2/context-preview.json',
    });
  } catch (e) {
    return json({ mode: 'phase2_context', ok: false, error: errMsg(e) }, 502);
  }
}

async function handlePhase2Start(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const testUserId = resolveTestUserId(body);
  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > 20_000) return json({ error: 'invalid_prompt' }, 400);

  const model = body.model ? String(body.model) : DEFAULT_MODEL;
  const idempotencyKey =
    String(body.idempotency_key || `phase2-start-${testUserId}-${Date.now()}`).trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return json({ error: 'idempotency_key_required' }, 400);
  }

  const strategy: MerchantContextStrategy = {};
  if (typeof body.max_products === 'number') strategy.maxProducts = body.max_products;
  if (Array.isArray(body.featured_ids)) {
    strategy.featuredIds = body.featured_ids.map(String);
  }

  const db = admin();
  await ensurePhase2Entitlement(db, testUserId);

  const { data: claim, error: claimErr } = await db.rpc('cursor_ai_claim_run', {
    p_user_id: testUserId,
    p_idempotency_key: idempotencyKey,
    p_run_type: 'initial',
    p_prompt: prompt,
    p_model: model,
  });
  if (claimErr) return json({ error: 'claim_failed', detail: claimErr.message }, 500);

  const c = claim as Record<string, unknown>;
  if (!c?.ok) {
    return json(
      {
        error: c?.reason || 'rejected',
        run_id: c?.run_id ?? null,
        active_run_id: c?.active_run_id ?? null,
      },
      c?.reason === 'run_already_active' ? 409 : 403,
    );
  }
  if (c.reused) {
    return json({
      mode: 'phase2_start',
      reused: true,
      run_id: c.run_id,
      session_id: c.session_id,
      cursor_run_id: c.cursor_run_id,
      status: c.status,
    });
  }

  await db
    .from('cursor_storefront_sessions')
    .update({ pipeline_status: 'preparing_context', context_strategy: strategy })
    .eq('id', c.session_id);

  let fullPrompt: string;
  let chars = 0;
  try {
    const loaded = await loadMerchantContextFromStoreApi({
      admin: db as never,
      userId: testUserId,
      strategy,
    });
    chars = loaded.chars;
    fullPrompt = buildGenerationPrompt(prompt, loaded.context);
    await db
      .from('cursor_storefront_sessions')
      .update({
        context_strategy: { ...strategy, last_chars: chars },
        pipeline_status: 'cursor_running',
      })
      .eq('id', c.session_id);
  } catch (e) {
    const msg = errMsg(e);
    await db.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    await db
      .from('cursor_storefront_sessions')
      .update({ pipeline_status: 'failed', last_error_category: 'context' })
      .eq('id', c.session_id);
    return json({ error: 'prepare_context_failed', detail: msg }, 502);
  }

  try {
    let agentId = typeof c.cursor_agent_id === 'string' ? c.cursor_agent_id : null;
    let cursorRunId: string;

    const { data: sessRow } = await db
      .from('cursor_storefront_sessions')
      .select('runtime_commit_sha, runtime_starting_ref')
      .eq('id', c.session_id)
      .maybeSingle();
    const pinSha =
      String(body.runtime_commit_sha || '').trim() ||
      String(sessRow?.runtime_commit_sha || '').trim() ||
      String(sessRow?.runtime_starting_ref || '').trim() ||
      runtimeRef();

    if (!agentId) {
      const created = await cursor.createAgent({
        name: `sv-p2-${testUserId.slice(0, 8)}`,
        prompt: { text: fullPrompt },
        model: { id: model },
        repos: [{ url: runtimeRepo(), startingRef: pinSha }],
        autoCreatePR: false,
      });
      agentId = created.agent.id;
      cursorRunId = created.run.id;
      await db
        .from('cursor_storefront_sessions')
        .update({
          cursor_agent_id: agentId,
          status: 'running',
          pipeline_status: 'cursor_running',
          runtime_repo_url: runtimeRepo(),
          runtime_starting_ref: pinSha,
          runtime_commit_sha: pinSha,
          runtime_revision: 'phase2',
        })
        .eq('id', c.session_id);
    } else {
      const follow = await cursor.createRun(agentId, {
        prompt: { text: fullPrompt },
        model: { id: model },
      });
      cursorRunId = follow.run.id;
    }

    await db
      .from('cursor_storefront_runs')
      .update({ cursor_run_id: cursorRunId, status: 'running', model, prompt })
      .eq('id', c.run_id);

    return json({
      mode: 'phase2_start',
      reused: false,
      run_id: c.run_id,
      session_id: c.session_id,
      agentId,
      runId: cursorRunId,
      cursor_run_id: cursorRunId,
      status: 'running',
      pipeline_status: 'cursor_running',
      model,
      contextChars: chars,
      runtime_commit_sha: pinSha,
    });
  } catch (e) {
    const msg = errMsg(e);
    await db.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    await db
      .from('cursor_storefront_runs')
      .update({ error_category: 'cursor', error_message: msg })
      .eq('id', c.run_id);
    await db
      .from('cursor_storefront_sessions')
      .update({ pipeline_status: 'failed', last_error_category: 'cursor' })
      .eq('id', c.session_id);
    return json({ error: 'cursor_start_failed', detail: msg }, 502);
  }
}

async function handlePhase2Poll(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const agentId = String(body.agentId || body.agent_id || '');
  const runId = String(body.runId || body.cursor_run_id || body.run_id || '');
  if (!agentId || !runId) return json({ error: 'agentId_and_runId_required' }, 400);
  const run = await cursor.getRun(agentId, runId);
  return json({
    mode: 'phase2_poll',
    id: run.id,
    agentId: run.agentId,
    status: run.status,
    durationMs: (run as { durationMs?: number }).durationMs ?? null,
    resultPreview: typeof run.result === 'string' ? run.result.slice(0, 300) : null,
  });
}

async function persistPhase2Usage(
  db: ReturnType<typeof admin>,
  cursor: CursorCloudClient,
  agentId: string,
  cursorRunId: string,
  dbRunId: string,
) {
  try {
    const usage = await cursor.getUsage(agentId, cursorRunId);
    const runs = (usage as { runs?: Array<Record<string, unknown>> }).runs || [];
    const u = runs[0] || {};
    const usageObj = (u.usage || {}) as Record<string, number>;
    const cost = (u.cost || null) as { chargedCents?: number; rawCostCents?: number } | null;
    await db
      .from('cursor_storefront_runs')
      .update({
        input_tokens: usageObj.inputTokens ?? null,
        output_tokens: usageObj.outputTokens ?? null,
        cache_write_tokens: usageObj.cacheWriteTokens ?? null,
        cache_read_tokens: usageObj.cacheReadTokens ?? null,
        total_tokens: usageObj.totalTokens ?? null,
        usage_uuid: (u.usageUuid as string) ?? null,
        actual_charged_cents: cost?.chargedCents ?? null,
        actual_raw_cost_cents: cost?.rawCostCents ?? null,
        cost_reconciliation_status: cost ? 'reconciled' : 'tokens_only',
      })
      .eq('id', dbRunId);
    return {
      usageUuid: u.usageUuid ?? null,
      chargedCents: cost?.chargedCents ?? null,
      totalTokens: usageObj.totalTokens ?? null,
    };
  } catch {
    return null;
  }
}

async function handlePhase2Complete(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const testUserId = resolveTestUserId(body);
  const dbRunId = String(body.run_id || body.dbRunId || '');
  const agentId = String(body.agentId || body.agent_id || '');
  const cursorRunId = String(body.runId || body.cursor_run_id || '');
  if (!dbRunId) return json({ error: 'run_id_required' }, 400);

  const db = admin();
  const { data: runRow } = await db
    .from('cursor_storefront_runs')
    .select('id, session_id, user_id, cursor_run_id, prompt, model, status')
    .eq('id', dbRunId)
    .eq('user_id', testUserId)
    .maybeSingle();
  if (!runRow) return json({ error: 'not_found' }, 404);

  const { data: session } = await db
    .from('cursor_storefront_sessions')
    .select('id, cursor_agent_id, current_draft_version_id')
    .eq('id', runRow.session_id)
    .single();

  const resolvedAgentId = agentId || session?.cursor_agent_id || '';
  const resolvedCursorRunId = cursorRunId || runRow.cursor_run_id || '';
  if (!resolvedAgentId || !resolvedCursorRunId) {
    return json({ error: 'no_cursor_run' }, 409);
  }

  const remote = await cursor.getRun(resolvedAgentId, resolvedCursorRunId);
  const status = String(remote.status).toUpperCase();
  if (status !== 'FINISHED') {
    if (['ERROR', 'CANCELLED', 'EXPIRED'].includes(status)) {
      await db.rpc('cursor_ai_release_run', {
        p_run_id: dbRunId,
        p_status: status.toLowerCase(),
        p_cursor_run_id: resolvedCursorRunId,
      });
      await db
        .from('cursor_storefront_sessions')
        .update({
          pipeline_status: status === 'CANCELLED' ? 'cancelled' : 'failed',
          last_error_category: status.toLowerCase(),
        })
        .eq('user_id', testUserId);
      return json({ mode: 'phase2_complete', ok: false, status: status.toLowerCase() });
    }
    return json({
      mode: 'phase2_complete',
      ok: false,
      pending: true,
      status: status.toLowerCase(),
    });
  }

  await db
    .from('cursor_storefront_sessions')
    .update({ pipeline_status: 'storing_artifact' })
    .eq('user_id', testUserId);

  try {
    const listed = await cursor.listArtifactsWithRetry(resolvedAgentId);
    const items = listed.items || [];
    const artifactPath = pickArtifactPath(items);
    if (!artifactPath) {
      await db.rpc('cursor_ai_release_run', {
        p_run_id: dbRunId,
        p_status: 'finished',
        p_cursor_run_id: resolvedCursorRunId,
      });
      await db
        .from('cursor_storefront_sessions')
        .update({ pipeline_status: 'needs_recovery', last_error_category: 'artifact' })
        .eq('user_id', testUserId);
      await persistPhase2Usage(db, cursor, resolvedAgentId, resolvedCursorRunId, dbRunId);
      return json({
        mode: 'phase2_complete',
        ok: false,
        error: 'no_artifacts',
        items,
        pipeline_status: 'needs_recovery',
      });
    }

    const download = await cursor.getArtifactDownload(resolvedAgentId, artifactPath);

    let companionManifestBytes: Uint8Array | null = null;
    const companionPath = findCompanionManifestPath(items, artifactPath);
    if (companionPath) {
      try {
        const companionDl = await cursor.getArtifactDownload(resolvedAgentId, companionPath);
        const companionRes = await fetch(companionDl.url);
        if (companionRes.ok) {
          companionManifestBytes = new Uint8Array(await companionRes.arrayBuffer());
        }
      } catch {
        companionManifestBytes = null;
      }
    }

    const { count } = await db
      .from('cursor_storefront_versions')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session!.id);
    const versionNumber = (count ?? 0) + 1;

    const baseManifest = { artifact_path: artifactPath, item_count: items.length };
    const { data: versionRow, error: vErr } = await db
      .from('cursor_storefront_versions')
      .insert({
        session_id: session!.id,
        user_id: testUserId,
        run_id: dbRunId,
        version_number: versionNumber,
        parent_version_id: session!.current_draft_version_id,
        prompt: runRow.prompt,
        model: runRow.model,
        cursor_artifact_path: artifactPath,
        status: 'captured',
        build_status: 'packaging',
        is_immutable: true,
        manifest: baseManifest,
      })
      .select('id')
      .single();

    if (vErr || !versionRow) throw new Error('version_insert_failed');

    let ingested;
    try {
      ingested = await ingestCursorArtifact({
        admin: db as never,
        downloadUrl: download.url,
        userId: testUserId,
        sessionId: session!.id,
        versionId: versionRow.id,
        cursorArtifactPath: artifactPath,
        companionManifestBytes,
        existingManifest: baseManifest,
      });
    } catch (ingestErr) {
      const detail = ingestErr instanceof Error ? ingestErr.message : errMsg(ingestErr);
      await db
        .from('cursor_storefront_sessions')
        .update({ pipeline_status: 'failed', last_error_category: 'artifact' })
        .eq('user_id', testUserId);
      await db.rpc('cursor_ai_release_run', {
        p_run_id: dbRunId,
        p_status: 'finished',
        p_cursor_run_id: resolvedCursorRunId,
      });
      await persistPhase2Usage(db, cursor, resolvedAgentId, resolvedCursorRunId, dbRunId);
      return json(
        {
          mode: 'phase2_complete',
          ok: false,
          error: 'ingest_failed',
          detail,
          version_id: versionRow.id,
          pipeline_status: 'failed',
        },
        422,
      );
    }

    await db
      .from('cursor_storefront_sessions')
      .update({
        current_draft_version_id: versionRow.id,
        pipeline_status: 'ready',
        last_error_category: null,
      })
      .eq('id', session!.id);

    const usageSummary = await persistPhase2Usage(
      db,
      cursor,
      resolvedAgentId,
      resolvedCursorRunId,
      dbRunId,
    );

    await db.rpc('cursor_ai_release_run', {
      p_run_id: dbRunId,
      p_status: 'finished',
      p_cursor_run_id: resolvedCursorRunId,
    });

    const { data: ent } = await db
      .from('cursor_ai_entitlements')
      .select('runs_used')
      .eq('user_id', testUserId)
      .maybeSingle();
    if (ent) {
      await db
        .from('cursor_ai_entitlements')
        .update({ runs_used: (ent.runs_used || 0) + 1 })
        .eq('user_id', testUserId);
    }

    return json({
      mode: 'phase2_complete',
      ok: true,
      status: 'finished',
      version_id: versionRow.id,
      version_number: versionNumber,
      content_sha256: ingested.contentSha256,
      content_size_bytes: ingested.contentSizeBytes,
      storage_path: ingested.storagePath,
      artifact_path: artifactPath,
      file_count: ingested.fileCount,
      site_prefix: `${artifactStorageDir({
        userId: testUserId,
        sessionId: session!.id,
        versionId: versionRow.id,
      })}/site`,
      usage: usageSummary,
    });
  } catch (e) {
    const msg = errMsg(e);
    await db
      .from('cursor_storefront_sessions')
      .update({ pipeline_status: 'needs_recovery', last_error_category: 'artifact' })
      .eq('user_id', testUserId);
    await db.rpc('cursor_ai_release_run', {
      p_run_id: dbRunId,
      p_status: 'error',
      p_cursor_run_id: resolvedCursorRunId,
    });
    return json({
      mode: 'phase2_complete',
      ok: false,
      error: 'complete_failed',
      detail: msg,
      pipeline_status: 'needs_recovery',
    }, 502);
  }
}

async function handlePhase2Followup(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const testUserId = resolveTestUserId(body);
  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > 20_000) return json({ error: 'invalid_prompt' }, 400);

  const model = body.model ? String(body.model) : DEFAULT_MODEL;
  const idempotencyKey =
    String(body.idempotency_key || `phase2-followup-${testUserId}-${Date.now()}`).trim();

  const db = admin();
  await ensurePhase2Entitlement(db, testUserId);

  const session = await loadActiveHarnessSession(
    db,
    testUserId,
    'id, cursor_agent_id, current_draft_version_id',
  );

  if (!session?.cursor_agent_id) {
    return json({ error: 'no_agent' }, 409);
  }

  const { data: claim, error: claimErr } = await db.rpc('cursor_ai_claim_run', {
    p_user_id: testUserId,
    p_idempotency_key: idempotencyKey,
    p_run_type: 'followup',
    p_prompt: prompt,
    p_model: model,
  });
  if (claimErr) return json({ error: 'claim_failed' }, 500);

  const c = claim as Record<string, unknown>;
  if (!c?.ok) {
    return json(
      {
        error: c?.reason || 'rejected',
        run_id: c?.run_id ?? null,
      },
      c?.reason === 'run_already_active' ? 409 : 403,
    );
  }
  if (c.reused) {
    return json({
      mode: 'phase2_followup',
      reused: true,
      run_id: c.run_id,
      session_id: c.session_id,
      cursor_run_id: c.cursor_run_id,
      parent_version_id: session.current_draft_version_id,
    });
  }

  const followPrompt = buildFollowupPrompt(prompt, session.current_draft_version_id);

  try {
    const follow = await cursor.createRun(session.cursor_agent_id, {
      prompt: { text: followPrompt },
      model: { id: model },
    });

    await db
      .from('cursor_storefront_runs')
      .update({
        cursor_run_id: follow.run.id,
        status: 'running',
        model,
        metadata: { parent_version_id: session.current_draft_version_id },
      })
      .eq('id', c.run_id);

    await db
      .from('cursor_storefront_sessions')
      .update({ pipeline_status: 'cursor_running' })
      .eq('id', session.id);

    return json({
      mode: 'phase2_followup',
      reused: false,
      run_id: c.run_id,
      session_id: c.session_id,
      agentId: session.cursor_agent_id,
      runId: follow.run.id,
      cursor_run_id: follow.run.id,
      status: 'running',
      parent_version_id: session.current_draft_version_id,
      pipeline_status: 'cursor_running',
      model,
    });
  } catch (e) {
    const msg = errMsg(e);
    await db.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    return json({ error: 'cursor_start_failed', detail: msg }, 502);
  }
}

async function handlePhase2Status(body: Record<string, unknown>) {
  const testUserId = resolveTestUserId(body);
  const db = admin();

  const session = await loadActiveHarnessSession(db, testUserId);

  const { data: versions } = await db
    .from('cursor_storefront_versions')
    .select(
      'id, version_number, parent_version_id, status, build_status, content_sha256, content_size_bytes, created_at',
    )
    .eq('user_id', testUserId)
    .order('version_number', { ascending: false })
    .limit(10);

  const { data: runs } = await db
    .from('cursor_storefront_runs')
    .select(
      'id, status, run_type, cursor_run_id, total_tokens, actual_charged_cents, error_category, created_at, finished_at',
    )
    .eq('user_id', testUserId)
    .order('created_at', { ascending: false })
    .limit(5);

  return json({
    mode: 'phase2_status',
    test_user_id: testUserId,
    session: session
      ? {
          id: session.id,
          status: session.status,
          pipeline_status: session.pipeline_status,
          has_agent: Boolean(session.cursor_agent_id),
          runtime_revision: session.runtime_revision,
          runtime_commit_sha: session.runtime_commit_sha,
          runtime_starting_ref: session.runtime_starting_ref,
          current_draft_version_id: session.current_draft_version_id,
          active_run_id: session.active_run_id,
          last_error_category: session.last_error_category,
          updated_at: session.updated_at,
        }
      : null,
    versions: versions ?? [],
    recent_runs: runs ?? [],
  });
}

async function handlePhase2Reseed(body: Record<string, unknown>) {
  const testUserId = resolveTestUserId(body);
  const runtimeCommitSha = String(
    body.runtime_commit_sha || Deno.env.get('CURSOR_RUNTIME_STARTING_REF') || '',
  ).trim();
  if (!runtimeCommitSha || runtimeCommitSha.length < 7) {
    return json({ error: 'runtime_commit_sha_required' }, 400);
  }
  const reason = String(body.replacement_reason || body.reason || 'phase2_reseed').trim();
  const db = admin();
  await ensurePhase2Entitlement(db, testUserId);

  try {
    const result = await createReplacementSessionRow(db, testUserId, runtimeCommitSha, reason);
    return json({
      mode: 'phase2_reseed',
      ok: true,
      ...result,
      note:
        'No Cursor agent created. Call phase2_start / start_generation on the new session to pin an agent to this SHA.',
    });
  } catch (e) {
    const msg = errMsg(e);
    const status = msg === 'run_already_active' ? 409 : 500;
    return json({ mode: 'phase2_reseed', ok: false, error: msg }, status);
  }
}

/**
 * Mint HMAC preview token for test_user_id + version_id (owner check).
 * Mirrors gateway get_preview_token without requiring a merchant JWT.
 */
async function handlePhase2PreviewToken(body: Record<string, unknown>) {
  const testUserId = resolveTestUserId(body);
  const versionId = String(body.version_id || '').trim();
  if (!versionId) return json({ error: 'version_id_required' }, 400);

  const db = admin();
  const { data } = await db
    .from('cursor_storefront_versions')
    .select(
      'id, status, build_status, storage_bucket, storage_path, preview_path, manifest, content_sha256, content_size_bytes, user_id',
    )
    .eq('id', versionId)
    .eq('user_id', testUserId)
    .maybeSingle();

  if (!data) {
    return json({ mode: 'phase2_preview_token', ok: false, error: 'not_found' }, 404);
  }

  const ttl = Math.min(
    Math.max(Number(body.ttl_seconds) || PREVIEW_TOKEN_DEFAULT_TTL_SECONDS, 30),
    600,
  );
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const previewPath = data.preview_path || 'index.html';

  if (!(data.storage_path && data.status === 'stored' && data.build_status === 'ready')) {
    return json({
      mode: 'phase2_preview_token',
      ok: false,
      version_id: data.id,
      status: data.status,
      build_status: data.build_status,
      error: 'not_ready',
      note: 'Artifact not ready for preview (need status=stored and build_status=ready).',
    });
  }

  const minted = await mintPreviewToken({
    versionId: data.id,
    userId: testUserId,
    ttlSeconds: ttl,
  });
  const previewUrl =
    `${supabaseUrl}/functions/v1/cursor-storefront-preview` +
    `?version_id=${encodeURIComponent(data.id)}` +
    `&path=${encodeURIComponent(previewPath)}` +
    `&token=${encodeURIComponent(minted.token)}`;
  const signedUrl = await createArtifactSignedUrl(db as never, data.storage_path, ttl);

  return json({
    mode: 'phase2_preview_token',
    ok: true,
    test_user_id: testUserId,
    version_id: data.id,
    status: data.status,
    build_status: data.build_status,
    token: minted.token,
    preview_url: previewUrl,
    expires_in: minted.expiresIn,
    signed_url: signedUrl,
    content_sha256: data.content_sha256,
    content_size_bytes: data.content_size_bytes,
    preview_path: previewPath,
  });
}

/**
 * Failure safety without live Cursor: insert a failed version while a good draft
 * pointer exists; assert current_draft_version_id is unchanged.
 */
async function handlePhase2SimulateArtifactFailure(body: Record<string, unknown>) {
  const testUserId = resolveTestUserId(body);
  const db = admin();

  const session = await loadActiveHarnessSession(
    db,
    testUserId,
    'id, current_draft_version_id, status',
  );
  if (!session?.id) {
    return json({ mode: 'phase2_simulate_artifact_failure', ok: false, error: 'no_session' }, 404);
  }
  const draftBefore = session.current_draft_version_id as string | null;
  if (!draftBefore) {
    return json(
      {
        mode: 'phase2_simulate_artifact_failure',
        ok: false,
        error: 'no_current_draft_version_id',
        detail: 'Seed a successful stored version first so draft pointer can be asserted unchanged.',
      },
      409,
    );
  }

  const { count } = await db
    .from('cursor_storefront_versions')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session.id);
  const versionNumber = (count ?? 0) + 1;

  const { data: failedVer, error: insErr } = await db
    .from('cursor_storefront_versions')
    .insert({
      session_id: session.id,
      user_id: testUserId,
      status: 'failed',
      build_status: 'failed',
      version_number: versionNumber,
      metadata: {
        ingest_error: 'phase2_simulate_artifact_failure',
        synthetic: true,
      },
    })
    .select('id, status, build_status')
    .single();

  if (insErr || !failedVer) {
    return json(
      { mode: 'phase2_simulate_artifact_failure', ok: false, error: insErr?.message || 'insert_failed' },
      500,
    );
  }

  const after = await loadActiveHarnessSession(db, testUserId, 'id, current_draft_version_id');
  const draftAfter = after?.current_draft_version_id as string | null;
  const unchanged = draftAfter === draftBefore;

  return json({
    mode: 'phase2_simulate_artifact_failure',
    ok: unchanged,
    session_id: session.id,
    failed_version_id: failedVer.id,
    current_draft_version_id_before: draftBefore,
    current_draft_version_id_after: draftAfter,
    draft_pointer_unchanged: unchanged,
    assertion: unchanged
      ? 'current_draft_version_id unchanged after failed version insert'
      : 'FAIL: draft pointer moved on failure',
  });
}
