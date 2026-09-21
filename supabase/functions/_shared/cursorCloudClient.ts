/**
 * Deno-compatible Cursor Cloud Agents REST client (v1 public beta).
 * Keep in sync conceptually with tools/cursor-cloud-phase1/src/cursorCloudClient.ts
 * Never expose CURSOR_API_KEY to the browser.
 */

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

  getAgent(agentId: string) {
    return this.#json<Record<string, unknown>>('GET', `/v1/agents/${encodeURIComponent(agentId)}`);
  }

  getRun(agentId: string, runId: string) {
    return this.#json<{
      id: string;
      agentId: string;
      status: string;
      result?: string;
      createdAt?: string;
      updatedAt?: string;
      finishedAt?: string;
      durationMs?: number;
      [key: string]: unknown;
    }>('GET', `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`);
  }

  /** GET /v1/agents/{id}/runs */
  listRuns(agentId: string, opts?: { limit?: number; cursor?: string }) {
    const q = new URLSearchParams();
    if (opts?.limit != null) q.set('limit', String(opts.limit));
    if (opts?.cursor) q.set('cursor', opts.cursor);
    const qs = q.toString() ? `?${q}` : '';
    return this.#json<{ items?: Array<Record<string, unknown>>; nextCursor?: string }>(
      'GET',
      `/v1/agents/${encodeURIComponent(agentId)}/runs${qs}`,
    );
  }

  /**
   * Legacy conversation history (v0).
   * GET /v0/agents/{id}/conversation
   */
  getConversation(agentId: string) {
    return this.#json<{
      id?: string;
      messages?: Array<{ id?: string; type?: string; text?: string }>;
    }>('GET', `/v0/agents/${encodeURIComponent(agentId)}/conversation`);
  }

  /**
   * Probe any relative Cursor path (debug only). Never logs the API key.
   * Returns { ok, status, body } instead of throwing on HTTP errors.
   */
  async tryGet(path: string): Promise<{ ok: boolean; status: number; body: unknown }> {
    const clean = path.startsWith('/') ? path : `/${path}`;
    const headers: Record<string, string> = {
      Authorization: `Basic ${btoa(`${this.#apiKey}:`)}`,
      Accept: 'application/json',
    };
    const res = await fetch(`${this.#baseUrl}${clean}`, { method: 'GET', headers });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text.slice(0, 8_000) };
      }
    }
    return { ok: res.ok, status: res.status, body: parsed };
  }

  /**
   * Best-effort SSE sample from GET /v1/agents/{id}/runs/{runId}/stream.
   * Aborts after timeoutMs; does not cancel the Cursor run.
   */
  async sampleStream(
    agentId: string,
    runId: string,
    opts?: { timeoutMs?: number; maxEvents?: number },
  ): Promise<{
    ok: boolean;
    status: number;
    retentionSeconds: number | null;
    events: Array<{ event: string; data: unknown; id?: string }>;
    truncated: boolean;
    error?: string;
  }> {
    const timeoutMs = opts?.timeoutMs ?? 4_000;
    const maxEvents = opts?.maxEvents ?? 40;
    const url =
      `${this.#baseUrl}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/stream`;
    const headers: Record<string, string> = {
      Authorization: `Basic ${btoa(`${this.#apiKey}:`)}`,
      Accept: 'text/event-stream',
    };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'GET', headers, signal: ac.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          ok: false,
          status: res.status,
          retentionSeconds: null,
          events: [],
          truncated: false,
          error: body.slice(0, 500) || `stream_http_${res.status}`,
        };
      }
      const retentionRaw = res.headers.get('X-Cursor-Stream-Retention-Seconds');
      const retentionSeconds = retentionRaw ? Number(retentionRaw) : null;
      if (!res.body) {
        return {
          ok: true,
          status: res.status,
          retentionSeconds,
          events: [],
          truncated: false,
          error: 'no_body',
        };
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let event: string | undefined;
      let dataLines: string[] = [];
      let id: string | undefined;
      const events: Array<{ event: string; data: unknown; id?: string }> = [];
      let truncated = false;

      const flush = () => {
        if (event === undefined && dataLines.length === 0) return;
        const raw = dataLines.join('\n');
        let data: unknown = raw;
        if (raw) {
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw.length > 2_000 ? `${raw.slice(0, 2_000)}…` : raw;
          }
        }
        const ev: { event: string; data: unknown; id?: string } = {
          event: event || 'message',
          data,
        };
        if (id !== undefined) ev.id = id;
        events.push(ev);
        event = undefined;
        dataLines = [];
        id = undefined;
      };

      while (events.length < maxEvents) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line === '') {
            flush();
            if (events.length >= maxEvents) {
              truncated = true;
              break;
            }
            continue;
          }
          if (line.startsWith(':')) continue;
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          let val = colon < 0 ? '' : line.slice(colon + 1);
          if (val.startsWith(' ')) val = val.slice(1);
          if (field === 'event') event = val;
          else if (field === 'data') dataLines.push(val);
          else if (field === 'id') id = val;
        }
        if (events.length >= maxEvents) {
          truncated = true;
          break;
        }
        if (events.some((e) => e.event === 'done' || e.event === 'result')) break;
      }
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return {
        ok: true,
        status: res.status,
        retentionSeconds,
        events,
        truncated,
      };
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      return {
        ok: false,
        status: 0,
        retentionSeconds: null,
        events: [],
        truncated: true,
        error: aborted ? 'timeout' : e instanceof Error ? e.message : 'stream_error',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  cancelRun(agentId: string, runId: string) {
    return this.#json<{ id: string }>(
      'POST',
      `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/cancel`,
    );
  }

  getUsage(agentId: string, runId?: string) {
    const q = runId ? `?runId=${encodeURIComponent(runId)}` : '';
    return this.#json<{
      totalUsage: TokenUsage;
      runs: Array<{ id: string; usageUuid?: string; usage: TokenUsage }>;
    }>('GET', `/v1/agents/${encodeURIComponent(agentId)}/usage${q}`);
  }

  listArtifacts(agentId: string) {
    return this.#json<{ items: Array<{ path: string; sizeBytes?: number }> }>(
      'GET',
      `/v1/agents/${encodeURIComponent(agentId)}/artifacts`,
    );
  }

  /** Retry briefly — artifact S3 index can lag a few seconds after a run finishes. */
  async listArtifactsWithRetry(agentId: string, attempts = 5, delayMs = 2500) {
    let listed: { items?: Array<{ path: string; sizeBytes?: number }> } = { items: [] };
    for (let i = 0; i < attempts; i++) {
      listed = await this.listArtifacts(agentId);
      if ((listed.items?.length ?? 0) > 0) return listed;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    return listed;
  }

  getArtifactDownload(agentId: string, path: string) {
    const q = `?path=${encodeURIComponent(path)}`;
    return this.#json<{ url: string; expiresAt: string }>(
      'GET',
      `/v1/agents/${encodeURIComponent(agentId)}/artifacts/download${q}`,
    );
  }

  archiveAgent(agentId: string) {
    return this.#json<{ id: string }>(
      'POST',
      `/v1/agents/${encodeURIComponent(agentId)}/archive`,
    );
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
      throw new CursorCloudApiError(res.status, `Cursor API ${method} ${path} (${res.status})`, parsed);
    }
    return parsed as T;
  }
}
