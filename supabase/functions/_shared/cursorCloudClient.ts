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
    return this.#json<{ id: string; agentId: string; status: string; result?: string }>(
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
