import { Agent, JsonlLocalAgentStore } from '@cursor/sdk';
import type { AgentUsage, RunResult, SDKAgent, SDKMessage, SettingSource, TokenUsage } from '@cursor/sdk';
import { DISALLOWED_TOOLS, MODEL_ID } from './config.ts';
import type { WorkspacePaths } from './createWorkspace.ts';
import { oneLine } from './sanitize.ts';
import { toTokenTotals, type AgentStatus, type CostReport, type TokenTotals } from './report.ts';

/** What one agent run reports back to the pipeline. */
export interface DriverResult {
  agentId: string | null;
  runId: string | null;
  status: AgentStatus;
  model: string | null;
  durationMs: number;
  usage: TokenTotals | null;
  cost: CostReport | null;
  costPending: boolean;
  agentUsageTotal: { usage: TokenTotals; cost: CostReport | null } | null;
  errorMessage?: string;
}

export interface DriverInput {
  paths: WorkspacePaths;
  /** Existing durable agent for this merchant workspace, if any (follow-ups reuse it). */
  agentId: string | null;
  /** Fully wrapped prompt. */
  prompt: string;
  timeoutMs: number;
  log: (line: string) => void;
  /** Called as soon as the agent id is known so it can be persisted before the run finishes. */
  onAgentId?: (agentId: string) => Promise<void> | void;
}

/** Injectable so the whole pipeline (protection, build, repair) can be tested without Cursor. */
export type AgentDriver = (input: DriverInput) => Promise<DriverResult>;

export class MissingApiKeyError extends Error {
  constructor() {
    super('CURSOR_API_KEY is not set in the environment. Export it in your shell for this session (see README); it is never read from a file.');
    this.name = 'MissingApiKeyError';
  }
}

function costOf(u: AgentUsage | null): CostReport | null {
  return u?.cost ? { chargedCents: u.cost.chargedCents, rawCostCents: u.cost.rawCostCents } : null;
}

function describeArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const a = args as Record<string, unknown>;
  const v = a.path ?? a.file_path ?? a.target_file ?? a.command ?? a.pattern ?? a.glob_pattern ?? a.query;
  return typeof v === 'string' ? oneLine(v, 90) : '';
}

/** Concise status/tool lines only. Thinking/reasoning messages are never printed. */
function summarize(msg: SDKMessage): string | null {
  switch (msg.type) {
    case 'tool_call':
      if (msg.status === 'running') return `tool ${msg.name} ${describeArgs(msg.args)}`.trim();
      if (msg.status === 'error') return `tool ${msg.name} failed`;
      return null;
    case 'status':
      return `status ${msg.status}${msg.message ? `: ${oneLine(msg.message, 80)}` : ''}`;
    case 'assistant': {
      const text = msg.message.content.find((b) => b.type === 'text');
      return text && text.type === 'text' && text.text.trim() ? `agent ${oneLine(text.text, 120)}` : null;
    }
    default:
      return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Real driver: one durable local agent per merchant workspace, sandboxed, hook-guarded. */
export const cursorDriver: AgentDriver = async (input) => {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const store = new JsonlLocalAgentStore(input.paths.agentStoreDir);
  const options = {
    apiKey,
    model: { id: MODEL_ID },
    name: `speedvendors-storefront:${input.paths.merchantId}`,
    // Not persisted by the SDK: passed again on resume so follow-ups keep the same restrictions.
    disallowedTools: DISALLOWED_TOOLS,
    local: {
      cwd: input.paths.workspaceDir, // never the main repository
      sandboxOptions: { enabled: true },
      autoReview: true,
      // Only <workspace>/.cursor (hooks.json, permissions.json). No user/team/plugin layers.
      settingSources: ['project'] as SettingSource[],
      store,
    },
  };

  let agent: SDKAgent | undefined;
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const started = Date.now();
  try {
    agent = input.agentId ? await Agent.resume(input.agentId, options) : await Agent.create(options);
    await input.onAgentId?.(agent.agentId);

    let before: AgentUsage | null = null;
    try {
      before = await agent.getUsage();
    } catch {
      /* a brand-new agent may have no usage yet */
    }

    const run = await agent.send(input.prompt);
    timer = setTimeout(() => {
      timedOut = true;
      void run.cancel().catch(() => undefined);
    }, input.timeoutMs);

    const streaming = run.supports('stream')
      ? (async () => {
          for await (const msg of run.stream()) {
            const line = summarize(msg);
            if (line) input.log(line);
          }
        })().catch(() => undefined)
      : Promise.resolve();

    const result: RunResult = await run.wait();
    await streaming;
    clearTimeout(timer);

    // Exact usage only: run.wait() usage plus agent.getUsage(). Cost can lag, so poll briefly and
    // otherwise report it as pending. Nothing here is estimated.
    let after: AgentUsage | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        after = await agent.getUsage();
      } catch {
        after = null;
      }
      if (after?.cost) break;
      if (attempt < 3) await sleep(2500);
    }
    let cost: CostReport | null = null;
    if (after?.cost) {
      const prior = before?.cost ?? { chargedCents: 0, rawCostCents: 0 };
      cost = {
        chargedCents: after.cost.chargedCents - prior.chargedCents,
        rawCostCents: after.cost.rawCostCents - prior.rawCostCents,
      };
    }
    const usage: TokenUsage | undefined = result.usage;
    return {
      agentId: agent.agentId,
      runId: run.id,
      status: timedOut ? 'timeout' : result.status,
      model: result.model?.id ?? MODEL_ID,
      durationMs: result.durationMs ?? Date.now() - started,
      usage: usage ? toTokenTotals(usage) : null,
      cost,
      costPending: cost === null,
      agentUsageTotal: after ? { usage: toTokenTotals(after.usage), cost: costOf(after) } : null,
      ...(result.error ? { errorMessage: oneLine(result.error.message, 300) } : {}),
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (agent) await agent[Symbol.asyncDispose]().catch(() => undefined);
  }
};
