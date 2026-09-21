/**
 * Authenticated SpeedVendors gateway for Cursor AI Store Builder (Phase 1).
 *
 * - Browser never receives CURSOR_API_KEY
 * - Browser cannot supply arbitrary cursor agent IDs
 * - Merchant ownership = authenticated user (profiles.user_id)
 * - Entitlement + concurrency checked in Postgres BEFORE Cursor calls
 * - Streaming: prefer create → persist run id → poll/reconnect (no long Edge SSE proxy)
 *
 * Developer-only: backend_feature_enabled must be true on cursor_ai_entitlements.
 * Ordinary merchants are rejected.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { CursorCloudApiError, CursorCloudClient } from '../_shared/cursorCloudClient.ts';
import { resolveActingOwnerId } from '../_shared/actingAs.ts';

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
  | 'models';

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

    // Ownership: merchant operates only their own session. Superadmin may act-as.
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
      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('cursor-storefront-gateway failed', { message });
    return json({ error: 'server_error' }, 500);
  }
});

async function handleStatus(admin: ReturnType<typeof createClient>, ownerId: string) {
  const { data: session } = await admin
    .from('cursor_storefront_sessions')
    .select('id, status, cursor_agent_id, runtime_revision, active_run_id, updated_at')
    .eq('user_id', ownerId)
    .maybeSingle();

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
          // Never return raw agent id to non-admin clients in Phase 1 product UI;
          // for harness we include a boolean presence only.
          has_agent: Boolean(session.cursor_agent_id),
          runtime_revision: session.runtime_revision,
          active_run_id: session.active_run_id,
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

  // Browser MUST NOT supply agentId — ignored if present.
  if (body.agent_id || body.agentId || body.cursor_agent_id) {
    return json({ error: 'agent_id_not_accepted' }, 400);
  }

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

  // Only now talk to Cursor.
  let cursor: CursorCloudClient;
  try {
    cursor = CursorCloudClient.fromEnv();
  } catch {
    await admin.rpc('cursor_ai_release_run', {
      p_run_id: c.run_id,
      p_status: 'error',
      p_cursor_run_id: null,
    });
    return json({ error: 'cursor_not_configured' }, 503);
  }

  const runtimeRepo = (Deno.env.get('CURSOR_RUNTIME_REPO_URL') || '').trim();
  const runtimeRef = (Deno.env.get('CURSOR_RUNTIME_STARTING_REF') || 'main').trim();

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
          runtime_repo_url: runtimeRepo || null,
          runtime_starting_ref: runtimeRepo ? runtimeRef : null,
        })
        .eq('id', c.session_id);
    } else {
      const follow = await cursor.createRun(agentId, {
        prompt: { text: prompt },
        ...(model ? { model: { id: model } } : {}),
      });
      cursorRunId = follow.run.id;
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
      // Phase 1 harness may need agent presence; product UI should use has_agent only.
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
    return json({ error: 'cursor_start_failed', detail: msg }, 502);
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
        try {
          usage = await cursor.getUsage(agentId, cursorRunId);
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
        } catch {
          /* usage optional */
        }
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
      return json({ error: 'cancel_failed', detail: e instanceof Error ? e.message : '' }, 502);
    }
  }

  await admin.rpc('cursor_ai_release_run', {
    p_run_id: runId,
    p_status: 'cancelled',
    p_cursor_run_id: cursorRunId,
  });
  return json({ ok: true, run_id: runId, status: 'cancelled' });
}

async function handleListArtifacts(admin: ReturnType<typeof createClient>, ownerId: string) {
  const { data: session } = await admin
    .from('cursor_storefront_sessions')
    .select('cursor_agent_id')
    .eq('user_id', ownerId)
    .maybeSingle();
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
  const { data: session } = await admin
    .from('cursor_storefront_sessions')
    .select('id, cursor_agent_id')
    .eq('user_id', ownerId)
    .maybeSingle();
  if (!session?.cursor_agent_id) return json({ error: 'no_session' }, 404);

  const cursor = CursorCloudClient.fromEnv();
  const download = await cursor.getArtifactDownload(session.cursor_agent_id, artifactPath);

  // Capture version metadata — SpeedVendors must later copy bytes to own storage.
  // Phase 1 returns the temporary URL to the authenticated owner only (harness).
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
  // Models catalogue is not merchant-secret, but still requires auth + entitlement path.
  const cursor = CursorCloudClient.fromEnv();
  const models = await cursor.listModels();
  return json(models);
}
