/**
 * Server-side Cursor Cloud Agents REST client (v1 public beta).
 *
 * Auth: Basic (apiKey as username, empty password) or Bearer.
 * Never import this into browser code. Never log the API key.
 *
 * Endpoint names mirror https://cursor.com/docs/cloud-agent/api/endpoints
 */

import {
  CursorCloudApiError,
  type AgentUsageResponse,
  type ArtifactDownload,
  type ArtifactItem,
  type CloudAgent,
  type CloudRun,
  type CreateAgentRequest,
  type CreateAgentResponse,
  type CreateRunRequest,
  type CreateRunResponse,
  type ModelsResponse,
  type StreamEvent,
} from './types.ts';

export type CursorCloudClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE = 'https://api.cursor.com';

export class CursorCloudClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CursorCloudClientOptions) {
    if (!options.apiKey || !options.apiKey.trim()) {
      throw new Error('CursorCloudClient requires a non-empty apiKey');
    }
    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl || fetch;
  }

  /** POST /v1/agents — create durable agent + initial run */
  async createAgent(body: CreateAgentRequest): Promise<CreateAgentResponse> {
    return this.requestJson<CreateAgentResponse>('POST', '/v1/agents', body);
  }

  /** POST /v1/agents/{id}/runs — follow-up run on same agent */
  async createRun(agentId: string, body: CreateRunRequest): Promise<CreateRunResponse> {
    return this.requestJson<CreateRunResponse>('POST', `/v1/agents/${enc(agentId)}/runs`, body);
  }

  /** GET /v1/agents/{id} */
  async getAgent(agentId: string): Promise<CloudAgent> {
    return this.requestJson<CloudAgent>('GET', `/v1/agents/${enc(agentId)}`);
  }

  /** GET /v1/agents/{id}/runs/{runId} */
  async getRun(agentId: string, runId: string): Promise<CloudRun> {
    return this.requestJson<CloudRun>(
      'GET',
      `/v1/agents/${enc(agentId)}/runs/${enc(runId)}`,
    );
  }

  /** GET /v1/agents/{id}/runs */
  async listRuns(
    agentId: string,
    opts?: { limit?: number; cursor?: string },
  ): Promise<{ items: CloudRun[]; nextCursor?: string }> {
    const q = new URLSearchParams();
    if (opts?.limit != null) q.set('limit', String(opts.limit));
    if (opts?.cursor) q.set('cursor', opts.cursor);
    const qs = q.toString() ? `?${q}` : '';
    return this.requestJson('GET', `/v1/agents/${enc(agentId)}/runs${qs}`);
  }

  /**
   * GET /v1/agents/{id}/runs/{runId}/stream — SSE.
   * Supports Last-Event-ID reconnect. Yields parsed events until `done` or abort.
   */
  async *streamRun(
    agentId: string,
    runId: string,
    opts?: { lastEventId?: string; signal?: AbortSignal },
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const url = `${this.baseUrl}/v1/agents/${enc(agentId)}/runs/${enc(runId)}/stream`;
    const headers: Record<string, string> = {
      ...this.authHeaders(),
      Accept: 'text/event-stream',
    };
    if (opts?.lastEventId) headers['Last-Event-ID'] = opts.lastEventId;

    const res = await this.fetchImpl(url, { method: 'GET', headers, signal: opts?.signal });
    if (!res.ok) {
      const body = await safeJson(res);
      throw new CursorCloudApiError(res.status, `stream failed (${res.status})`, body);
    }
    if (!res.body) throw new CursorCloudApiError(res.status, 'stream response has no body');

    const retention = res.headers.get('X-Cursor-Stream-Retention-Seconds');
    if (retention) {
      yield { event: '_meta', data: { streamRetentionSeconds: Number(retention) } };
    }

    yield* parseSse(res.body);
  }

  /** Convenience: poll getRun until terminal or timeout. */
  async observeRun(
    agentId: string,
    runId: string,
    opts?: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal },
  ): Promise<CloudRun> {
    const interval = opts?.intervalMs ?? 2000;
    const timeout = opts?.timeoutMs ?? 15 * 60_000;
    const start = Date.now();
    for (;;) {
      if (opts?.signal?.aborted) throw new Error('observeRun aborted');
      const run = await this.getRun(agentId, runId);
      if (isTerminal(run.status)) return run;
      if (Date.now() - start > timeout) {
        throw new Error(`observeRun timed out after ${timeout}ms (status=${run.status})`);
      }
      await sleep(interval, opts?.signal);
    }
  }

  /** POST /v1/agents/{id}/runs/{runId}/cancel */
  async cancelRun(agentId: string, runId: string): Promise<{ id: string }> {
    return this.requestJson('POST', `/v1/agents/${enc(agentId)}/runs/${enc(runId)}/cancel`);
  }

  /**
   * GET /v1/agents/{id}/usage — TOKEN usage only (no chargedCents).
   * Optional runId scopes to one run.
   */
  async getUsage(agentId: string, opts?: { runId?: string }): Promise<AgentUsageResponse> {
    const q = opts?.runId ? `?runId=${encodeURIComponent(opts.runId)}` : '';
    return this.requestJson('GET', `/v1/agents/${enc(agentId)}/usage${q}`);
  }

  /** GET /v1/agents/{id}/artifacts */
  async listArtifacts(agentId: string): Promise<{ items: ArtifactItem[] }> {
    return this.requestJson('GET', `/v1/agents/${enc(agentId)}/artifacts`);
  }

  /** GET /v1/agents/{id}/artifacts/download?path= */
  async getArtifactDownload(agentId: string, path: string): Promise<ArtifactDownload> {
    const q = `?path=${encodeURIComponent(path)}`;
    return this.requestJson('GET', `/v1/agents/${enc(agentId)}/artifacts/download${q}`);
  }

  /** Download artifact bytes via temporary URL (does not use Cursor auth on S3). */
  async downloadArtifactBytes(agentId: string, path: string): Promise<{
    download: ArtifactDownload;
    bytes: Uint8Array;
  }> {
    const download = await this.getArtifactDownload(agentId, path);
    const res = await this.fetchImpl(download.url, { method: 'GET' });
    if (!res.ok) {
      throw new CursorCloudApiError(res.status, `artifact download failed (${res.status})`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return { download, bytes: buf };
  }

  /** POST /v1/agents/{id}/archive */
  async archiveAgent(agentId: string): Promise<{ id: string }> {
    return this.requestJson('POST', `/v1/agents/${enc(agentId)}/archive`);
  }

  /** POST /v1/agents/{id}/unarchive */
  async unarchiveAgent(agentId: string): Promise<{ id: string }> {
    return this.requestJson('POST', `/v1/agents/${enc(agentId)}/unarchive`);
  }

  /** DELETE /v1/agents/{id} — irreversible */
  async deleteAgent(agentId: string): Promise<void> {
    await this.requestJson<unknown>('DELETE', `/v1/agents/${enc(agentId)}`);
  }

  /** GET /v1/models */
  async listModels(): Promise<ModelsResponse> {
    return this.requestJson<ModelsResponse>('GET', '/v1/models');
  }

  /** GET /v1/me */
  async getMe(): Promise<unknown> {
    return this.requestJson('GET', '/v1/me');
  }

  /** GET /v1/repositories — GitHub repos accessible to this API key */
  async listRepositories(): Promise<unknown> {
    return this.requestJson('GET', '/v1/repositories');
  }

  private authHeaders(): Record<string, string> {
    const token = btoa(`${this.apiKey}:`);
    return { Authorization: `Basic ${token}` };
  }

  private async requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...this.authHeaders(),
      Accept: 'application/json',
    };
    let payload: string | undefined;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: payload,
    });
    if (res.status === 204) return undefined as T;
    const parsed = await safeJson(res);
    if (!res.ok) {
      const msg =
        (parsed && typeof parsed === 'object' && 'message' in parsed
          ? String((parsed as { message: unknown }).message)
          : null) || `Cursor API ${method} ${path} failed (${res.status})`;
      throw new CursorCloudApiError(res.status, msg, parsed);
    }
    return parsed as T;
  }
}

export function isTerminal(status: string | undefined): boolean {
  if (!status) return false;
  return ['FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED'].includes(status.toUpperCase());
}

function enc(id: string): string {
  return encodeURIComponent(id);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Minimal SSE parser for Cursor run streams. */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event: string | undefined;
  let dataLines: string[] = [];
  let id: string | undefined;

  const flush = (): StreamEvent | null => {
    if (event === undefined && dataLines.length === 0) return null;
    const raw = dataLines.join('\n');
    let data: unknown = raw;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
    }
    const ev: StreamEvent = { event: event || 'message', data };
    if (id !== undefined) ev.id = id;
    event = undefined;
    dataLines = [];
    id = undefined;
    return ev;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line === '') {
          const ev = flush();
          if (ev) yield ev;
          continue;
        }
        if (line.startsWith(':')) continue; // comment
        const colon = line.indexOf(':');
        const field = colon < 0 ? line : line.slice(0, colon);
        let val = colon < 0 ? '' : line.slice(colon + 1);
        if (val.startsWith(' ')) val = val.slice(1);
        if (field === 'event') event = val;
        else if (field === 'data') dataLines.push(val);
        else if (field === 'id') id = val;
      }
    }
    const last = flush();
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}

/** Factory that reads CURSOR_API_KEY from env (never from a file). */
export function createCursorCloudClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CursorCloudClient {
  const apiKey = env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'CURSOR_API_KEY is not set. Export it in this shell session only (never commit it).',
    );
  }
  return new CursorCloudClient({ apiKey });
}
