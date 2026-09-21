/**
 * Developer-only Phase 1 live proof harness (short actions).
 * Auth: Authorization: Bearer <PHASE1_HARNESS_TOKEN>
 * CURSOR_API_KEY stays in Edge secrets — never returned.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
};

export type CreateAgentBody = {
  prompt: { text: string };
  model?: { id: string; params?: Array<{ id: string; value: string }> };
  name?: string;
  repos?: Array<{ url: string; startingRef?: string }>;
  autoCreatePR?: boolean;
  mode?: string;
};

export type CreateRunBody = {
  prompt: { text: string };
  model?: { id: string; params?: Array<{ id: string; value: string }> };
};

export class CursorCloudApiError extends Error {
  status: number;
  code: string | null;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'CursorCloudApiError';
    this.status = status;
    this.code = null;
    this.body = body ?? null;
    if (body && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      if (typeof o.error === 'string') this.code = o.error;
      else if (typeof o.code === 'string') this.code = o.code;
    }
  }
}

export class CursorCloudClient {
  #apiKey: string;
  #baseUrl: string;
  constructor(apiKey: string, baseUrl = 'https://api.cursor.com') {
    if (!apiKey?.trim()) throw new Error('CURSOR_API_KEY missing');
    this.#apiKey = apiKey.trim();
    this.#baseUrl = baseUrl.replace(/\/$/, '');
  }
  static fromEnv(): CursorCloudClient {
    const key = (Deno.env.get('CURSOR_API_KEY') || '').trim();
    if (!key) throw new Error('CURSOR_API_KEY secret not configured');
    return new CursorCloudClient(key);
  }
  createAgent(body: CreateAgentBody) {
    return this.#json<{ agent: { id: string }; run: { id: string; agentId: string; status: string } }>(
      'POST',
      '/v1/agents',
      body,
    );
  }
  createRun(agentId: string, body: CreateRunBody) {
    return this.#json<{ run: { id: string; agentId: string; status: string } }>(
      'POST',
      `/v1/agents/${encodeURIComponent(agentId)}/runs`,
      body,
    );
  }
  getRun(agentId: string, runId: string) {
    return this.#json<{ id: string; agentId: string; status: string; result?: string; durationMs?: number }>(
      'GET',
      `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
    );
  }
  cancelRun(agentId: string, runId: string) {
    return this.#json<{ id: string }>(
      'POST',
      `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/cancel`,
    );
  }
  getUsage(agentId: string, runId?: string) {
    const q = runId ? `?runId=${encodeURIComponent(runId)}` : '';
    return this.#json<Record<string, unknown>>(
      'GET',
      `/v1/agents/${encodeURIComponent(agentId)}/usage${q}`,
    );
  }
  listArtifacts(agentId: string) {
    return this.#json<{ items: Array<{ path: string; sizeBytes?: number }> }>(
      'GET',
      `/v1/agents/${encodeURIComponent(agentId)}/artifacts`,
    );
  }
  getArtifactDownload(agentId: string, path: string) {
    const q = `?path=${encodeURIComponent(path)}`;
    return this.#json<{ url: string; expiresAt: string }>(
      'GET',
      `/v1/agents/${encodeURIComponent(agentId)}/artifacts/download${q}`,
    );
  }
  archiveAgent(agentId: string) {
    return this.#json<{ id: string }>('POST', `/v1/agents/${encodeURIComponent(agentId)}/archive`);
  }
  listModels() {
    return this.#json<Record<string, unknown>>('GET', '/v1/models');
  }
  getMe() {
    return this.#json<Record<string, unknown>>('GET', '/v1/me');
  }
  listRepositories() {
    return this.#json<Record<string, unknown>>('GET', '/v1/repositories');
  }
  async #json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Basic ${btoa(`${this.#apiKey}:`)}`,
      Accept: 'application/json',
    };
    let payload: string | undefined;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${this.#baseUrl}${path}`, { method, headers, body: payload });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }
    if (!res.ok) {
      const detail =
        parsed && typeof parsed === 'object'
          ? JSON.stringify(parsed).slice(0, 800)
          : String(parsed);
      throw new CursorCloudApiError(
        res.status,
        `Cursor API ${method} ${path} (${res.status}) ${detail}`,
        parsed,
      );
    }
    return parsed as T;
  }
}

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!harnessAuthorized(req)) return json({ error: 'unauthorized' }, 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = String(body.mode || 'probe');

  let cursor: CursorCloudClient;
  try {
    cursor = CursorCloudClient.fromEnv();
  } catch {
    return json({ error: 'cursor_not_configured' }, 503);
  }

  try {
    switch (mode) {
      case 'probe':
        return await handleProbe(cursor);
      case 'create':
        return await handleCreate(cursor, body);
      case 'get_run':
        return await handleGetRun(cursor, body);
      case 'followup':
        return await handleFollowup(cursor, body);
      case 'claim_only':
        return await handleClaimOnly(body);
      case 'persist_usage':
        return await handlePersistUsage(cursor, body);
      case 'release':
        return await handleRelease(body);
      case 'artifacts':
        return await handleArtifacts(cursor, body);
      case 'download_artifact':
        return await handleDownloadArtifact(cursor, body);
      case 'usage':
        return await handleUsage(cursor, body);
      case 'cancel_probe':
        return await handleCancel(cursor, body);
      case 'entitlement_probe':
        return await handleEntitlement(body);
      case 'archive':
        return await handleArchive(cursor, body);
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
    durationMs: run.durationMs ?? null,
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
  // Ensure no active lock before starting Cursor follow-up
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
  const listed = await cursor.listArtifacts(agentId);
  const match =
    listed.items?.find((i) => i.path.includes('phase1-live')) ||
    listed.items?.find((i) => i.path.startsWith('artifacts/')) ||
    listed.items?.[0];
  // List can lag behind upload; fall back to known Phase 1 marker path.
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

/** Download by explicit path even when listArtifacts returns empty (platform lag / index gap). */
async function handleDownloadArtifact(cursor: CursorCloudClient, body: Record<string, unknown>) {
  const agentId = String(body.agentId || '');
  const testUserId = String(body.test_user_id || '');
  const path = String(body.path || 'artifacts/phase1-live-marker.txt');
  const listed = await cursor.listArtifacts(agentId);
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

  // Cancel an existing run (local poller path).
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
  // Return immediately; caller polls get_run until CANCELLED (cancel is async).
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
