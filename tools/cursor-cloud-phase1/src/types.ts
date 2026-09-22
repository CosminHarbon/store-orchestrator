/** Cloud Agents REST v1 shapes (public beta). Keep thin — API may change. */

export type AgentStatus =
  | 'CREATING'
  | 'RUNNING'
  | 'FINISHED'
  | 'ERROR'
  | 'CANCELLED'
  | 'EXPIRED'
  | string;

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
};

export type RunUsageEntry = {
  id: string;
  usageUuid?: string;
  usage: TokenUsage;
};

export type AgentUsageResponse = {
  totalUsage: TokenUsage;
  runs: RunUsageEntry[];
};

export type CloudAgent = {
  id: string;
  name?: string;
  status?: string;
  source?: unknown;
  latestRunId?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type CloudRun = {
  id: string;
  agentId: string;
  status: AgentStatus;
  createdAt?: string;
  updatedAt?: string;
  durationMs?: number;
  result?: string;
  git?: unknown;
  [key: string]: unknown;
};

export type CreateAgentResponse = {
  agent: CloudAgent;
  run: CloudRun;
};

export type CreateRunResponse = {
  run: CloudRun;
};

export type ArtifactItem = {
  path: string;
  sizeBytes?: number;
  updatedAt?: string;
};

export type ArtifactDownload = {
  url: string;
  expiresAt: string;
};

export type ModelInfo = {
  id: string;
  displayName?: string;
  params?: Array<{ id: string; displayName?: string; type?: string }>;
  [key: string]: unknown;
};

export type ModelsResponse = {
  items?: ModelInfo[];
  models?: ModelInfo[];
  defaultModelId?: string;
  [key: string]: unknown;
};

export type PromptInput = {
  text: string;
  images?: Array<{ data?: string; mimeType?: string; url?: string }>;
};

export type ModelSelection = {
  id: string;
  params?: Array<{ id: string; value: string }>;
};

export type RepoConfig = {
  url: string;
  startingRef?: string;
  prUrl?: string;
};

export type CreateAgentRequest = {
  prompt: PromptInput;
  model?: ModelSelection;
  name?: string;
  repos?: RepoConfig[];
  env?: { type: string; name?: string };
  workOnCurrentBranch?: boolean;
  autoCreatePR?: boolean;
  skipReviewerRequest?: boolean;
  envVars?: Record<string, string>;
  mode?: 'agent' | 'plan' | string;
  agentId?: string;
};

export type CreateRunRequest = {
  prompt: PromptInput;
  model?: ModelSelection;
};

export type StreamEvent = {
  id?: string;
  event: string;
  data: unknown;
};

export class CursorCloudApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'CursorCloudApiError';
    this.status = status;
    this.code = extractCode(body);
    this.body = body ?? null;
  }
}

function extractCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (typeof o.error === 'string') return o.error;
  if (o.error && typeof o.error === 'object') {
    const inner = o.error as Record<string, unknown>;
    if (typeof inner.code === 'string') return inner.code;
  }
  if (typeof o.code === 'string') return o.code;
  return null;
}
