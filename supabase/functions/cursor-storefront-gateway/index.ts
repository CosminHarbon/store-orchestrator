/**
 * Authenticated SpeedVendors gateway for Cursor AI Store Builder (Phase 1 + 2).
 *
 * - Browser never receives CURSOR_API_KEY
 * - Browser cannot supply arbitrary cursor agent IDs
 * - Merchant ownership = authenticated user (profiles.user_id)
 * - Entitlement + concurrency checked in Postgres BEFORE Cursor calls
 * - Phase 2: prepare_context / start_generation return quickly; complete_run ingests artifacts
 *
 * Developer-only: backend_feature_enabled must be true on cursor_ai_entitlements.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { CursorCloudApiError, CursorCloudClient } from '../_shared/cursorCloudClient.ts';
import { resolveActingOwnerId } from '../_shared/actingAs.ts';
import {
  loadMerchantContextFromStoreApi,
  type MerchantContextStrategy,
} from '../_shared/cursorMerchantContext.ts';
import {
  createArtifactSignedUrl,
  ingestCursorArtifact,
  artifactStorageDir,
} from '../_shared/cursorArtifactStore.ts';
import {
  findCompanionManifestPath,
  pickArtifactPath,
} from '../_shared/cursorArtifactPaths.ts';
import { mintPreviewToken, PREVIEW_TOKEN_DEFAULT_TTL_SECONDS } from '../_shared/cursorPreviewToken.ts';
import {
  buildFollowupPrompt,
  buildGenerationPrompt,
} from '../_shared/cursorGenerationPrompt.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-idempotency-key',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

type Action =
  | 'status'
  | 'start_run'
  | 'get_run'
  | 'cancel_run'
  | 'list_artifacts'
  | 'download_artifact'
  | 'models'
  | 'prepare_context'
  | 'start_generation'
  | 'complete_run'
  | 'followup_edit'
  | 'get_version'
  | 'list_versions'
  | 'get_preview_token'
  | 'create_replacement_session';

/** Active = not replaced/archived (at most one per user via partial unique index). */
function activeSessionFilter(q: {
  not: (col: string, op: string, val: string) => typeof q;
}) {
  return q.not('status', 'in', '(replaced,archived)');
}

async function loadActiveSession(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  select =
    'id, status, pipeline_status, cursor_agent_id, runtime_revision, runtime_commit_sha, runtime_repo_url, runtime_starting_ref, current_draft_version_id, active_run_id, last_error_category, metadata, updated_at',
) {
  let q = admin.from('cursor_storefront_sessions').select(select).eq('user_id', ownerId);
  q = activeSessionFilter(q as never) as typeof q;
  const { data } = await q.maybeSingle();
  return data;
}

const ERROR_CATEGORIES = new Set([
  'cursor',
  'entitlement',
  'concurrency',
  'context',
  'artifact',
  'storage',
  'validation',
  'timeout',
  'cancelled',
  'needs_recovery',
  'invalid_args',
  'not_configured',
  'unknown',
]);

function normalizeErrorCategory(raw: unknown): string {
  const s = String(raw || 'unknown').toLowerCase().replace(/\s+/g, '_');
  if (ERROR_CATEGORIES.has(s)) return s;
  if (s.includes('entitlement') || s.includes('budget') || s.includes('runs_exhaust')) {
    return 'entitlement';
  }
  if (s.includes('active') || s.includes('concurren')) return 'concurrency';
  if (s.includes('artifact')) return 'artifact';
  if (s.includes('storage') || s.includes('upload')) return 'storage';
  if (s.includes('context')) return 'context';
  if (s.includes('cursor') || s.includes('502') || s.includes('503')) return 'cursor';
  return 'unknown';
}

function rejectBrowserAgentId(body: Record<string, unknown>): Response | null {
  if (body.agent_id || body.agentId || body.cursor_agent_id) {
    return json({ error: 'agent_id_not_accepted' }, 400);
  }
  return null;
}

function runtimeStartingRef(): string {
  // Prefer exact SHA when set (CURSOR_RUNTIME_STARTING_REF=abc123…); else branch name.
  return (Deno.env.get('CURSOR_RUNTIME_STARTING_REF') || 'main').trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(supabaseUrl, service);
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || '') as Action;

    let ownerId: string;
    try {
      ownerId = await resolveActingOwnerId(
        admin,
        user,
        jwt,
        typeof body.acting_as_user_id === 'string' ? body.acting_as_user_id : null,
      );
    } catch {
      return json({ error: 'forbidden' }, 403);
    }

    switch (action) {
      case 'status':
        return await handleStatus(admin, ownerId);
      case 'start_run':
        return await handleStartRun(admin, ownerId, body, req);
      case 'get_run':
        return await handleGetRun(admin, ownerId, body);
      case 'cancel_run':
        return await handleCancelRun(admin, ownerId, body);
      case 'list_artifacts':
        return await handleListArtifacts(admin, ownerId);
      case 'download_artifact':
        return await handleDownloadArtifact(admin, ownerId, body);
      case 'models':
        return await handleModels();
      case 'prepare_context':
        return await handlePrepareContext(admin, ownerId, body);
      case 'start_generation':
        return await handleStartGeneration(admin, ownerId, body, req);
      case 'complete_run':
        return await handleCompleteRun(admin, ownerId, body);
      case 'followup_edit':
        return await handleFollowupEdit(admin, ownerId, body, req);
      case 'get_version':
        return await handleGetVersion(admin, ownerId, body);
      case 'list_versions':
        return await handleListVersions(admin, ownerId);
      case 'get_preview_token':
        return await handleGetPreviewToken(admin, ownerId, body);
      case 'create_replacement_session':
        return await handleCreateReplacementSession(admin, ownerId, body);
      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('cursor-storefront-gateway failed', { message });
    return json({ error: 'server_error', error_category: normalizeErrorCategory(message) }, 500);
  }
});

async function handleStatus(admin: ReturnType<typeof createClient>, ownerId: string) {
  const session = await loadActiveSession(admin, ownerId);

  const { data: ent } = await admin
    .from('cursor_ai_entitlements')
    .select(
      'enabled, backend_feature_enabled, plan_kind, budget_cents, spent_charged_cents, runs_used, max_runs',
    )
    .eq('user_id', ownerId)
    .maybeSingle();

  const { data: gate } = await admin.rpc('cursor_ai_may_start_run', { p_user_id: ownerId });

  return json({
    session: session
      ? {
          id: session.id,
          status: session.status,
          pipeline_status: session.pipeline_status,
          has_agent: Boolean(session.cursor_agent_id),
          runtime_revision: session.runtime_revision,
          runtime_commit_sha: session.runtime_commit_sha,
          current_draft_version_id: session.current_draft_version_id,
          active_run_id: session.active_run_id,
          last_error_category: session.last_error_category,
          updated_at: session.updated_at,
        }
      : null,
    entitlement: ent ?? { enabled: false, backend_feature_enabled: false },
    may_start: gate,
  });
}

async function handleStartRun(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
  req: Request,
) {
  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > 20_000) return json({ error: 'invalid_prompt' }, 400);

  const idempotencyKey =
    String(body.idempotency_key || req.headers.get('x-idempotency-key') || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return json({ error: 'idempotency_key_required' }, 400);
  }

  const agentReject = rejectBrowserAgentId(body);
  if (agentReject) return agentReject;

  const runType = String(body.run_type || 'followup');
  const model = body.model ? String(body.model) : null;

  const { data: claim, error: claimErr } = await admin.rpc('cursor_ai_claim_run', {
    p_user_id: ownerId,
    p_idempotency_key: idempotencyKey,
    p_run_type: runType,
    p_prompt: prompt,
    p_model: model,
  });

  if (claimErr) {
    console.error('claim_run failed', claimErr.message);
    return json({ error: 'claim_failed' }, 500);
  }

  const c = claim as Record<string, unknown>;
  if (!c?.ok) {
    return json(
      {
        error: c?.reason || 'rejected',
        error_category: normalizeErrorCategory(c?.reason),
        run_id: c?.run_id ?? null,
        active_run_id: c?.active_run_id ?? null,
      },
      c?.reason === 'run_already_active' ? 409 : 403,
    );
  }

  if (c.reused) {
    return json({
      reused: true,
      run_id: c.run_id,
      session_id: c.session_id,
      cursor_run_id: c.cursor_run_id,
      status: c.status,
    });
  }

  let cursor: CursorCloudClient;
  try {
    cursor = CursorCloudClient.fromEnv();
  } catch {
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    return json({ error: 'cursor_not_configured', error_category: 'not_configured' }, 503);
  }

  const runtimeRepo = (Deno.env.get('CURSOR_RUNTIME_REPO_URL') || '').trim();
  const runtimeRef = runtimeStartingRef();

  try {
    let agentId = typeof c.cursor_agent_id === 'string' ? c.cursor_agent_id : null;
    let cursorRunId: string;

    if (!agentId) {
      const created = await cursor.createAgent({
        name: `sv-${ownerId.slice(0, 8)}`,
        prompt: { text: prompt },
        ...(model ? { model: { id: model } } : {}),
        ...(runtimeRepo
          ? { repos: [{ url: runtimeRepo, startingRef: runtimeRef }], autoCreatePR: false }
          : {}),
      });
      agentId = created.agent.id;
      cursorRunId = created.run.id;
      await admin
        .from('cursor_storefront_sessions')
        .update({
          cursor_agent_id: agentId,
          status: 'running',
          pipeline_status: 'cursor_running',
          runtime_repo_url: runtimeRepo || null,
          runtime_starting_ref: runtimeRepo ? runtimeRef : null,
          runtime_commit_sha: runtimeRepo ? runtimeRef : null,
        })
        .eq('id', c.session_id);
    } else {
      const follow = await cursor.createRun(agentId, {
        prompt: { text: prompt },
        ...(model ? { model: { id: model } } : {}),
      });
      cursorRunId = follow.run.id;
      await admin
        .from('cursor_storefront_sessions')
        .update({ pipeline_status: 'cursor_running' })
        .eq('id', c.session_id);
    }

    await admin
      .from('cursor_storefront_runs')
      .update({
        cursor_run_id: cursorRunId,
        status: 'running',
        model,
      })
      .eq('id', c.run_id);

    return json({
      reused: false,
      run_id: c.run_id,
      session_id: c.session_id,
      cursor_run_id: cursorRunId,
      status: 'running',
      has_agent: true,
    });
  } catch (e) {
    const msg = e instanceof CursorCloudApiError ? `${e.status}:${e.code}` : 'cursor_error';
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    await admin
      .from('cursor_storefront_runs')
      .update({
        error_category: normalizeErrorCategory('cursor'),
        error_message: msg,
      })
      .eq('id', c.run_id);
    await admin
      .from('cursor_storefront_sessions')
      .update({
        pipeline_status: 'failed',
        last_error_category: normalizeErrorCategory('cursor'),
      })
      .eq('id', c.session_id);
    return json({ error: 'cursor_start_failed', detail: msg, error_category: 'cursor' }, 502);
  }
}

async function loadOwnedRun(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  runId: string,
) {
  const { data } = await admin
    .from('cursor_storefront_runs')
    .select('*, cursor_storefront_sessions!inner(cursor_agent_id, user_id)')
    .eq('id', runId)
    .eq('user_id', ownerId)
    .maybeSingle();
  return data;
}

async function persistUsageIfPossible(
  admin: ReturnType<typeof createClient>,
  cursor: CursorCloudClient,
  agentId: string,
  cursorRunId: string,
  runId: string,
) {
  try {
    const usage = await cursor.getUsage(agentId, cursorRunId);
    const u = (usage as { runs?: Array<{ usage?: Record<string, number>; usageUuid?: string }> })
      ?.runs?.[0];
    if (u?.usage) {
      await admin
        .from('cursor_storefront_runs')
        .update({
          input_tokens: u.usage.inputTokens ?? null,
          output_tokens: u.usage.outputTokens ?? null,
          cache_write_tokens: u.usage.cacheWriteTokens ?? null,
          cache_read_tokens: u.usage.cacheReadTokens ?? null,
          total_tokens: u.usage.totalTokens ?? null,
          usage_uuid: u.usageUuid ?? null,
          cost_reconciliation_status: 'tokens_only',
        })
        .eq('id', runId);
    }
    return usage;
  } catch {
    return null;
  }
}

async function handleGetRun(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const runId = String(body.run_id || '');
  if (!runId) return json({ error: 'run_id_required' }, 400);

  const row = await loadOwnedRun(admin, ownerId, runId);
  if (!row) return json({ error: 'not_found' }, 404);

  const agentId = (row as { cursor_storefront_sessions?: { cursor_agent_id?: string } })
    .cursor_storefront_sessions?.cursor_agent_id;
  const cursorRunId = row.cursor_run_id as string | null;

  let cursorStatus: unknown = null;
  let usage: unknown = null;
  if (agentId && cursorRunId) {
    try {
      const cursor = CursorCloudClient.fromEnv();
      const remote = await cursor.getRun(agentId, cursorRunId);
      cursorStatus = { status: remote.status, result: remote.result ?? null };
      const terminal = ['FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED'].includes(
        String(remote.status).toUpperCase(),
      );
      if (terminal && ['running', 'creating', 'queued'].includes(row.status)) {
        const mapped = String(remote.status).toLowerCase();
        await admin.rpc('cursor_ai_release_run', {
          p_run_id: runId,
          p_status: mapped === 'finished' ? 'finished' : mapped,
          p_cursor_run_id: cursorRunId,
        });
        usage = await persistUsageIfPossible(admin, cursor, agentId, cursorRunId, runId);
      }
    } catch (e) {
      cursorStatus = { error: e instanceof Error ? e.message : 'cursor_error' };
    }
  }

  const { data: fresh } = await admin
    .from('cursor_storefront_runs')
    .select(
      'id, status, run_type, cursor_run_id, total_tokens, usage_uuid, cost_reconciliation_status, actual_charged_cents, estimated_cost_cents, error_category, created_at, finished_at',
    )
    .eq('id', runId)
    .single();

  return json({ run: fresh, cursor: cursorStatus, usage });
}

async function handleCancelRun(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const runId = String(body.run_id || '');
  const row = await loadOwnedRun(admin, ownerId, runId);
  if (!row) return json({ error: 'not_found' }, 404);

  const agentId = (row as { cursor_storefront_sessions?: { cursor_agent_id?: string } })
    .cursor_storefront_sessions?.cursor_agent_id;
  const cursorRunId = row.cursor_run_id as string | null;
  if (!agentId || !cursorRunId) return json({ error: 'no_cursor_run' }, 409);

  try {
    const cursor = CursorCloudClient.fromEnv();
    await cursor.cancelRun(agentId, cursorRunId);
  } catch (e) {
    if (!(e instanceof CursorCloudApiError && e.status === 409)) {
      return json(
        {
          error: 'cancel_failed',
          detail: e instanceof Error ? e.message : '',
          error_category: 'cursor',
        },
        502,
      );
    }
  }

  await admin.rpc('cursor_ai_release_run', {
    p_run_id: runId,
    p_status: 'cancelled',
    p_cursor_run_id: cursorRunId,
  });
  await admin
    .from('cursor_storefront_sessions')
    .update({
      pipeline_status: 'cancelled',
      last_error_category: 'cancelled',
    })
    .eq('user_id', ownerId);
  return json({ ok: true, run_id: runId, status: 'cancelled' });
}

async function handleListArtifacts(admin: ReturnType<typeof createClient>, ownerId: string) {
  const session = await loadActiveSession(admin, ownerId, 'cursor_agent_id');
  if (!session?.cursor_agent_id) return json({ items: [] });

  const cursor = CursorCloudClient.fromEnv();
  const listed = await cursor.listArtifacts(session.cursor_agent_id);
  return json(listed);
}

async function handleDownloadArtifact(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const artifactPath = String(body.path || '');
  if (!artifactPath.startsWith('artifacts/')) {
    return json({ error: 'invalid_artifact_path' }, 400);
  }
  const session = await loadActiveSession(admin, ownerId, 'id, cursor_agent_id');
  if (!session?.cursor_agent_id) return json({ error: 'no_session' }, 404);

  const cursor = CursorCloudClient.fromEnv();
  const download = await cursor.getArtifactDownload(session.cursor_agent_id, artifactPath);

  const { count } = await admin
    .from('cursor_storefront_versions')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session.id);
  const versionNumber = (count ?? 0) + 1;

  await admin.from('cursor_storefront_versions').insert({
    session_id: session.id,
    user_id: ownerId,
    cursor_artifact_path: artifactPath,
    status: 'captured',
    version_number: versionNumber,
    metadata: { expires_at: download.expiresAt, note: 'presigned_temporary' },
  });

  return json({
    path: artifactPath,
    url: download.url,
    expires_at: download.expiresAt,
    warning:
      'Presigned Cursor URL is temporary. Production must copy into SpeedVendors storage before publish.',
  });
}

async function handleModels() {
  const cursor = CursorCloudClient.fromEnv();
  const models = await cursor.listModels();
  return json(models);
}

// ---- Phase 2 ----------------------------------------------------------------

async function handlePrepareContext(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const strategy: MerchantContextStrategy = {};
  if (typeof body.max_products === 'number') strategy.maxProducts = body.max_products;
  if (Array.isArray(body.featured_ids)) {
    strategy.featuredIds = body.featured_ids.map(String);
  }

  const existing = await loadActiveSession(admin, ownerId, 'id');
  if (existing?.id) {
    await admin
      .from('cursor_storefront_sessions')
      .update({
        pipeline_status: 'preparing_context',
        context_strategy: strategy,
      })
      .eq('id', existing.id);
  } else {
    await admin.from('cursor_storefront_sessions').insert({
      user_id: ownerId,
      status: 'idle',
      pipeline_status: 'preparing_context',
      context_strategy: strategy,
    });
  }

  try {
    const { context, chars, source } = await loadMerchantContextFromStoreApi({
      admin: admin as never,
      userId: ownerId,
      strategy,
    });

    const active = await loadActiveSession(admin, ownerId, 'id');
    if (active?.id) {
      await admin
        .from('cursor_storefront_sessions')
        .update({
          pipeline_status: 'ready',
          context_strategy: { ...strategy, last_chars: chars, source },
          last_error_category: null,
        })
        .eq('id', active.id);
    }

    return json({ context, chars, source });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'context_failed';
    const active = await loadActiveSession(admin, ownerId, 'id');
    if (active?.id) {
      await admin
        .from('cursor_storefront_sessions')
        .update({
          pipeline_status: 'failed',
          last_error_category: normalizeErrorCategory('context'),
        })
        .eq('id', active.id);
    }
    return json({ error: 'prepare_context_failed', detail: msg, error_category: 'context' }, 502);
  }
}

async function handleStartGeneration(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
  req: Request,
) {
  const agentReject = rejectBrowserAgentId(body);
  if (agentReject) return agentReject;

  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > 20_000) return json({ error: 'invalid_prompt' }, 400);

  const idempotencyKey =
    String(body.idempotency_key || req.headers.get('x-idempotency-key') || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return json({ error: 'idempotency_key_required' }, 400);
  }

  const model = body.model ? String(body.model) : null;
  const strategy: MerchantContextStrategy = {};
  if (typeof body.max_products === 'number') strategy.maxProducts = body.max_products;
  if (Array.isArray(body.featured_ids)) {
    strategy.featuredIds = body.featured_ids.map(String);
  }

  // Claim BEFORE Cursor / context network (entitlement + concurrency).
  const { data: claim, error: claimErr } = await admin.rpc('cursor_ai_claim_run', {
    p_user_id: ownerId,
    p_idempotency_key: idempotencyKey,
    p_run_type: 'initial',
    p_prompt: prompt,
    p_model: model,
  });
  if (claimErr) return json({ error: 'claim_failed' }, 500);

  const c = claim as Record<string, unknown>;
  if (!c?.ok) {
    return json(
      {
        error: c?.reason || 'rejected',
        error_category: normalizeErrorCategory(c?.reason),
        run_id: c?.run_id ?? null,
        active_run_id: c?.active_run_id ?? null,
      },
      c?.reason === 'run_already_active' ? 409 : 403,
    );
  }
  if (c.reused) {
    return json({
      reused: true,
      run_id: c.run_id,
      session_id: c.session_id,
      cursor_run_id: c.cursor_run_id,
      status: c.status,
    });
  }

  await admin
    .from('cursor_storefront_sessions')
    .update({ pipeline_status: 'preparing_context', context_strategy: strategy })
    .eq('id', c.session_id);

  let fullPrompt: string;
  try {
    const { context, chars } = await loadMerchantContextFromStoreApi({
      admin: admin as never,
      userId: ownerId,
      strategy,
    });
    fullPrompt = buildGenerationPrompt(prompt, context);
    await admin
      .from('cursor_storefront_sessions')
      .update({
        context_strategy: { ...strategy, last_chars: chars },
        pipeline_status: 'cursor_running',
      })
      .eq('id', c.session_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'context_failed';
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    await admin
      .from('cursor_storefront_sessions')
      .update({
        pipeline_status: 'failed',
        last_error_category: 'context',
      })
      .eq('id', c.session_id);
    await admin
      .from('cursor_storefront_runs')
      .update({ error_category: 'context', error_message: msg })
      .eq('id', c.run_id);
    return json({ error: 'prepare_context_failed', detail: msg, error_category: 'context' }, 502);
  }

  let cursor: CursorCloudClient;
  try {
    cursor = CursorCloudClient.fromEnv();
  } catch {
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    return json({ error: 'cursor_not_configured', error_category: 'not_configured' }, 503);
  }

  const runtimeRepo = (Deno.env.get('CURSOR_RUNTIME_REPO_URL') || '').trim();
  const runtimeRef = runtimeStartingRef();

  try {
    let agentId = typeof c.cursor_agent_id === 'string' ? c.cursor_agent_id : null;
    let cursorRunId: string;

    if (!agentId) {
      const created = await cursor.createAgent({
        name: `sv-${ownerId.slice(0, 8)}`,
        prompt: { text: fullPrompt },
        ...(model ? { model: { id: model } } : {}),
        ...(runtimeRepo
          ? { repos: [{ url: runtimeRepo, startingRef: runtimeRef }], autoCreatePR: false }
          : {}),
      });
      agentId = created.agent.id;
      cursorRunId = created.run.id;
      await admin
        .from('cursor_storefront_sessions')
        .update({
          cursor_agent_id: agentId,
          status: 'running',
          pipeline_status: 'cursor_running',
          runtime_repo_url: runtimeRepo || null,
          runtime_starting_ref: runtimeRepo ? runtimeRef : null,
          runtime_commit_sha: runtimeRepo ? runtimeRef : null,
        })
        .eq('id', c.session_id);
    } else {
      const follow = await cursor.createRun(agentId, {
        prompt: { text: fullPrompt },
        ...(model ? { model: { id: model } } : {}),
      });
      cursorRunId = follow.run.id;
    }

    await admin
      .from('cursor_storefront_runs')
      .update({ cursor_run_id: cursorRunId, status: 'running', model, prompt })
      .eq('id', c.run_id);

    // Return quickly — caller polls get_run / complete_run.
    return json({
      reused: false,
      run_id: c.run_id,
      session_id: c.session_id,
      cursor_run_id: cursorRunId,
      status: 'running',
      pipeline_status: 'cursor_running',
      runtime_commit_sha: runtimeRepo ? runtimeRef : null,
      has_agent: true,
    });
  } catch (e) {
    const msg = e instanceof CursorCloudApiError ? `${e.status}:${e.code}` : 'cursor_error';
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    await admin
      .from('cursor_storefront_runs')
      .update({ error_category: 'cursor', error_message: msg })
      .eq('id', c.run_id);
    await admin
      .from('cursor_storefront_sessions')
      .update({ pipeline_status: 'failed', last_error_category: 'cursor' })
      .eq('id', c.session_id);
    return json({ error: 'cursor_start_failed', detail: msg, error_category: 'cursor' }, 502);
  }
}

async function handleCompleteRun(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const runId = String(body.run_id || '');
  if (!runId) return json({ error: 'run_id_required' }, 400);

  const row = await loadOwnedRun(admin, ownerId, runId);
  if (!row) return json({ error: 'not_found' }, 404);

  const sessionMeta = row as {
    session_id: string;
    prompt?: string | null;
    model?: string | null;
    status: string;
    cursor_run_id?: string | null;
    cursor_storefront_sessions?: { cursor_agent_id?: string };
  };
  const agentId = sessionMeta.cursor_storefront_sessions?.cursor_agent_id;
  const cursorRunId = sessionMeta.cursor_run_id;
  if (!agentId || !cursorRunId) {
    return json({ error: 'no_cursor_run', error_category: 'invalid_args' }, 409);
  }

  let cursor: CursorCloudClient;
  try {
    cursor = CursorCloudClient.fromEnv();
  } catch {
    return json({ error: 'cursor_not_configured', error_category: 'not_configured' }, 503);
  }

  let remote;
  try {
    remote = await cursor.getRun(agentId, cursorRunId);
  } catch (e) {
    return json(
      {
        error: 'cursor_poll_failed',
        detail: e instanceof Error ? e.message : '',
        error_category: 'cursor',
      },
      502,
    );
  }

  const status = String(remote.status).toUpperCase();
  if (status !== 'FINISHED') {
    if (['ERROR', 'CANCELLED', 'EXPIRED'].includes(status)) {
      await admin.rpc('cursor_ai_release_run', {
        p_run_id: runId,
        p_status: status.toLowerCase(),
        p_cursor_run_id: cursorRunId,
      });
      await admin
        .from('cursor_storefront_sessions')
        .update({
          pipeline_status: status === 'CANCELLED' ? 'cancelled' : 'failed',
          last_error_category: normalizeErrorCategory(status),
        })
        .eq('user_id', ownerId);
      return json({
        ok: false,
        status: status.toLowerCase(),
        error_category: normalizeErrorCategory(status),
      });
    }
    // Still running — caller should poll again.
    return json({
      ok: false,
      pending: true,
      status: status.toLowerCase(),
      pipeline_status: 'cursor_running',
    });
  }

  await admin
    .from('cursor_storefront_sessions')
    .update({ pipeline_status: 'storing_artifact' })
    .eq('user_id', ownerId);

  try {
    const listed = await cursor.listArtifactsWithRetry(agentId);
    const items = listed.items || [];
    const artifactPath = pickArtifactPath(items);
    if (!artifactPath) {
      await admin.rpc('cursor_ai_release_run', {
        p_run_id: runId,
        p_status: 'finished',
        p_cursor_run_id: cursorRunId,
      });
      await admin
        .from('cursor_storefront_sessions')
        .update({
          pipeline_status: 'needs_recovery',
          last_error_category: 'artifact',
        })
        .eq('user_id', ownerId);
      await persistUsageIfPossible(admin, cursor, agentId, cursorRunId, runId);
      return json({
        ok: false,
        error: 'no_artifacts',
        error_category: 'needs_recovery',
        pipeline_status: 'needs_recovery',
      });
    }

    const download = await cursor.getArtifactDownload(agentId, artifactPath);

    let companionManifestBytes: Uint8Array | null = null;
    const companionPath = findCompanionManifestPath(items, artifactPath);
    if (companionPath) {
      try {
        const companionDl = await cursor.getArtifactDownload(agentId, companionPath);
        const companionRes = await fetch(companionDl.url);
        if (companionRes.ok) {
          companionManifestBytes = new Uint8Array(await companionRes.arrayBuffer());
        }
      } catch {
        companionManifestBytes = null;
      }
    }

    const { data: session } = await admin
      .from('cursor_storefront_sessions')
      .select('id, current_draft_version_id')
      .eq('user_id', ownerId)
      .single();

    const { count } = await admin
      .from('cursor_storefront_versions')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session!.id);
    const versionNumber = (count ?? 0) + 1;

    const baseManifest = { artifact_path: artifactPath, items };
    const { data: versionRow, error: vErr } = await admin
      .from('cursor_storefront_versions')
      .insert({
        session_id: session!.id,
        user_id: ownerId,
        run_id: runId,
        version_number: versionNumber,
        parent_version_id: session!.current_draft_version_id,
        prompt: sessionMeta.prompt,
        model: sessionMeta.model,
        cursor_artifact_path: artifactPath,
        status: 'captured',
        build_status: 'packaging',
        is_immutable: true,
        manifest: baseManifest,
      })
      .select('id')
      .single();

    if (vErr || !versionRow) {
      throw new Error('version_insert_failed');
    }

    let ingested;
    try {
      ingested = await ingestCursorArtifact({
        admin: admin as never,
        downloadUrl: download.url,
        userId: ownerId,
        sessionId: session!.id,
        versionId: versionRow.id,
        cursorArtifactPath: artifactPath,
        companionManifestBytes,
        existingManifest: baseManifest,
      });
    } catch (ingestErr) {
      // Leave current_draft_version_id unchanged; version already marked failed by ingest.
      const detail = ingestErr instanceof Error ? ingestErr.message : 'ingest_failed';
      await admin
        .from('cursor_storefront_sessions')
        .update({
          pipeline_status: 'failed',
          last_error_category: 'artifact',
        })
        .eq('user_id', ownerId);
      await admin.rpc('cursor_ai_release_run', {
        p_run_id: runId,
        p_status: 'finished',
        p_cursor_run_id: cursorRunId,
      });
      await persistUsageIfPossible(admin, cursor, agentId, cursorRunId, runId);
      return json(
        {
          ok: false,
          error: 'ingest_failed',
          detail,
          version_id: versionRow.id,
          error_category: 'artifact',
          pipeline_status: 'failed',
        },
        422,
      );
    }

    await admin
      .from('cursor_storefront_sessions')
      .update({
        current_draft_version_id: versionRow.id,
        pipeline_status: 'ready',
        last_error_category: null,
      })
      .eq('id', session!.id);

    await admin.rpc('cursor_ai_release_run', {
      p_run_id: runId,
      p_status: 'finished',
      p_cursor_run_id: cursorRunId,
    });

    const usage = await persistUsageIfPossible(admin, cursor, agentId, cursorRunId, runId);

    // Increment runs_used on entitlement (best-effort).
    const { data: ent } = await admin
      .from('cursor_ai_entitlements')
      .select('runs_used')
      .eq('user_id', ownerId)
      .maybeSingle();
    if (ent) {
      await admin
        .from('cursor_ai_entitlements')
        .update({ runs_used: (ent.runs_used || 0) + 1 })
        .eq('user_id', ownerId);
    }

    return json({
      ok: true,
      status: 'finished',
      pipeline_status: 'ready',
      version_id: versionRow.id,
      version_number: versionNumber,
      storage_path: ingested.storagePath,
      content_sha256: ingested.contentSha256,
      content_size_bytes: ingested.contentSizeBytes,
      file_count: ingested.fileCount,
      site_prefix: `${artifactStorageDir({
        userId: ownerId,
        sessionId: session!.id,
        versionId: versionRow.id,
      })}/site`,
      usage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'complete_failed';
    await admin
      .from('cursor_storefront_sessions')
      .update({
        pipeline_status: 'needs_recovery',
        last_error_category: normalizeErrorCategory(msg),
      })
      .eq('user_id', ownerId);
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: runId,
      p_status: 'error',
      p_cursor_run_id: cursorRunId,
    });
    return json({
      ok: false,
      error: 'complete_run_failed',
      detail: msg,
      error_category: 'needs_recovery',
      pipeline_status: 'needs_recovery',
    }, 502);
  }
}

async function handleFollowupEdit(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
  req: Request,
) {
  const agentReject = rejectBrowserAgentId(body);
  if (agentReject) return agentReject;

  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > 20_000) return json({ error: 'invalid_prompt' }, 400);

  const idempotencyKey =
    String(body.idempotency_key || req.headers.get('x-idempotency-key') || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return json({ error: 'idempotency_key_required' }, 400);
  }

  const model = body.model ? String(body.model) : null;

  const session = await loadActiveSession(
    admin,
    ownerId,
    'id, cursor_agent_id, current_draft_version_id',
  );

  if (!session?.cursor_agent_id) {
    return json({ error: 'no_agent', error_category: 'invalid_args' }, 409);
  }

  const { data: claim, error: claimErr } = await admin.rpc('cursor_ai_claim_run', {
    p_user_id: ownerId,
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
        error_category: normalizeErrorCategory(c?.reason),
        run_id: c?.run_id ?? null,
      },
      c?.reason === 'run_already_active' ? 409 : 403,
    );
  }
  if (c.reused) {
    return json({
      reused: true,
      run_id: c.run_id,
      session_id: c.session_id,
      cursor_run_id: c.cursor_run_id,
      status: c.status,
      parent_version_id: session.current_draft_version_id,
    });
  }

  let cursor: CursorCloudClient;
  try {
    cursor = CursorCloudClient.fromEnv();
  } catch {
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    return json({ error: 'cursor_not_configured', error_category: 'not_configured' }, 503);
  }

  const followPrompt = buildFollowupPrompt(prompt, session.current_draft_version_id);

  try {
    const follow = await cursor.createRun(session.cursor_agent_id, {
      prompt: { text: followPrompt },
      ...(model ? { model: { id: model } } : {}),
    });

    await admin
      .from('cursor_storefront_runs')
      .update({
        cursor_run_id: follow.run.id,
        status: 'running',
        model,
        metadata: { parent_version_id: session.current_draft_version_id },
      })
      .eq('id', c.run_id);

    await admin
      .from('cursor_storefront_sessions')
      .update({ pipeline_status: 'cursor_running' })
      .eq('id', session.id);

    return json({
      reused: false,
      run_id: c.run_id,
      session_id: c.session_id,
      cursor_run_id: follow.run.id,
      status: 'running',
      parent_version_id: session.current_draft_version_id,
      pipeline_status: 'cursor_running',
    });
  } catch (e) {
    const msg = e instanceof CursorCloudApiError ? `${e.status}:${e.code}` : 'cursor_error';
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    return json({ error: 'cursor_start_failed', detail: msg, error_category: 'cursor' }, 502);
  }
}

async function handleCreateReplacementSession(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  /**
   * Reseed stub: create a NEW session pinned to body.runtime_commit_sha.
   * Does NOT mutate the old session's runtime_commit_sha.
   * Does NOT delete old versions.
   * Does NOT create a Cursor agent by default — call start_generation on the
   * new session to provision an agent pinned to the new SHA.
   * Optional body.create_agent=true is reserved / ignored in this stub.
   */
  const runtimeCommitSha = String(body.runtime_commit_sha || '').trim();
  if (!runtimeCommitSha || runtimeCommitSha.length < 7) {
    return json({ error: 'runtime_commit_sha_required', error_category: 'invalid_args' }, 400);
  }
  const reason =
    String(body.replacement_reason || body.reason || 'runtime_reseed').trim() || 'runtime_reseed';

  const old = await loadActiveSession(
    admin,
    ownerId,
    'id, user_id, status, runtime_commit_sha, runtime_repo_url, runtime_starting_ref, runtime_revision, metadata, active_run_id',
  );
  if (!old) {
    return json({ error: 'no_active_session', error_category: 'invalid_args' }, 404);
  }
  if (old.active_run_id) {
    return json(
      {
        error: 'run_already_active',
        error_category: 'concurrency',
        active_run_id: old.active_run_id,
      },
      409,
    );
  }
  if (old.runtime_commit_sha === runtimeCommitSha) {
    return json(
      {
        error: 'same_runtime_commit_sha',
        error_category: 'invalid_args',
        session_id: old.id,
        runtime_commit_sha: runtimeCommitSha,
      },
      409,
    );
  }

  // Free the one-active-per-user unique slot, then insert successor.
  const { error: markErr } = await admin
    .from('cursor_storefront_sessions')
    .update({
      status: 'replaced',
      replaced_at: new Date().toISOString(),
      replacement_reason: reason,
      active_run_id: null,
      pipeline_status: null,
    })
    .eq('id', old.id);
  if (markErr) {
    return json({ error: 'replace_mark_failed', detail: markErr.message }, 500);
  }

  const prevMeta =
    old.metadata && typeof old.metadata === 'object' && !Array.isArray(old.metadata)
      ? (old.metadata as Record<string, unknown>)
      : {};
  const storeId =
    typeof prevMeta.store_id === 'string'
      ? prevMeta.store_id
      : typeof body.store_id === 'string'
        ? body.store_id
        : null;

  const { data: neu, error: insErr } = await admin
    .from('cursor_storefront_sessions')
    .insert({
      user_id: ownerId,
      status: 'idle',
      pipeline_status: null,
      cursor_agent_id: null,
      runtime_revision: old.runtime_revision || 'phase2',
      runtime_repo_url: old.runtime_repo_url || Deno.env.get('CURSOR_RUNTIME_REPO_URL') || null,
      runtime_starting_ref: runtimeCommitSha,
      runtime_commit_sha: runtimeCommitSha,
      current_draft_version_id: null,
      active_run_id: null,
      metadata: {
        ...prevMeta,
        ...(storeId ? { store_id: storeId } : {}),
        seed_from_session_id: old.id,
        seed_from_runtime_commit_sha: old.runtime_commit_sha,
      },
    })
    .select('id, runtime_commit_sha')
    .single();

  if (insErr || !neu) {
    // Best-effort rollback: restore old session so merchant is not left without an active row.
    await admin
      .from('cursor_storefront_sessions')
      .update({
        status: old.status || 'ready',
        replaced_at: null,
        replacement_reason: null,
      })
      .eq('id', old.id);
    return json({ error: 'replace_insert_failed', detail: insErr?.message }, 500);
  }

  await admin
    .from('cursor_storefront_sessions')
    .update({ replaced_by_session_id: neu.id })
    .eq('id', old.id);

  // create_agent intentionally not implemented in stub — start_generation on new session
  // creates the Cursor agent pinned to runtime_commit_sha / CURSOR_RUNTIME_STARTING_REF.
  if (body.create_agent === true) {
    console.info(
      'create_replacement_session: create_agent=true ignored; use start_generation on new session',
    );
  }

  return json({
    old_session_id: old.id,
    new_session_id: neu.id,
    runtime_commit_sha: neu.runtime_commit_sha,
    note:
      'Old versions retained on old session. Call start_generation on the new session to create a Cursor agent pinned to the new SHA.',
  });
}

async function handleGetVersion(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const versionId = String(body.version_id || '');
  if (!versionId) return json({ error: 'version_id_required' }, 400);

  const { data } = await admin
    .from('cursor_storefront_versions')
    .select(
      'id, session_id, run_id, version_number, parent_version_id, prompt, model, manifest, preview_path, is_immutable, build_status, status, storage_bucket, storage_path, content_sha256, content_size_bytes, cursor_artifact_path, created_at, metadata',
    )
    .eq('id', versionId)
    .eq('user_id', ownerId)
    .maybeSingle();

  if (!data) return json({ error: 'not_found' }, 404);
  return json({ version: data });
}

async function handleListVersions(admin: ReturnType<typeof createClient>, ownerId: string) {
  const { data } = await admin
    .from('cursor_storefront_versions')
    .select(
      'id, version_number, parent_version_id, status, build_status, content_sha256, content_size_bytes, created_at, prompt, model',
    )
    .eq('user_id', ownerId)
    .order('version_number', { ascending: false })
    .limit(50);

  return json({ versions: data || [] });
}

async function handleGetPreviewToken(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const versionId = String(body.version_id || '');
  if (!versionId) return json({ error: 'version_id_required' }, 400);

  const { data } = await admin
    .from('cursor_storefront_versions')
    .select(
      'id, status, build_status, storage_bucket, storage_path, preview_path, manifest, content_sha256, content_size_bytes, metadata, user_id',
    )
    .eq('id', versionId)
    .eq('user_id', ownerId)
    .maybeSingle();

  if (!data) return json({ error: 'not_found' }, 404);

  const ttl = Math.min(
    Math.max(Number(body.ttl_seconds) || PREVIEW_TOKEN_DEFAULT_TTL_SECONDS, 30),
    600,
  );

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const previewPath = data.preview_path || 'index.html';

  if (data.storage_path && data.status === 'stored' && data.build_status === 'ready') {
    const minted = await mintPreviewToken({
      versionId: data.id,
      userId: ownerId,
      ttlSeconds: ttl,
    });
    const previewUrl =
      `${supabaseUrl}/functions/v1/cursor-storefront-preview` +
      `?version_id=${encodeURIComponent(data.id)}` +
      `&path=${encodeURIComponent(previewPath)}` +
      `&token=${encodeURIComponent(minted.token)}`;

    // Keep signed URL as optional archive download (not for iframe HTML).
    const signedUrl = await createArtifactSignedUrl(admin as never, data.storage_path, ttl);

    return json({
      version_id: data.id,
      status: data.status,
      build_status: data.build_status,
      token: minted.token,
      preview_url: previewUrl,
      expires_in: minted.expiresIn,
      signed_url: signedUrl,
      content_sha256: data.content_sha256,
      content_size_bytes: data.content_size_bytes,
      manifest: data.manifest,
      preview_path: previewPath,
    });
  }

  return json({
    version_id: data.id,
    status: data.status,
    build_status: data.build_status,
    token: null,
    preview_url: null,
    signed_url: null,
    expires_in: ttl,
    manifest: data.manifest,
    preview_path: data.preview_path,
    note: 'Artifact not ready for preview (need status=stored and build_status=ready).',
  });
}
