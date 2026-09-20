import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileChange } from './protectedFiles.ts';
import type { WorkspacePaths } from './createWorkspace.ts';

export type RunKind = 'generate' | 'followup' | 'repair';
export type AgentStatus = 'finished' | 'error' | 'cancelled' | 'timeout';
export type RunStatus = AgentStatus | 'protected_files_touched' | 'not_run';

export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** cacheReadTokens + cacheWriteTokens */
  cacheTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
}

export interface CostReport {
  /** Amount actually charged (float cents), straight from Cursor. */
  chargedCents: number;
  /** Undiscounted model cost (float cents), straight from Cursor. */
  rawCostCents: number;
}

export interface BuildReport {
  status: 'passed' | 'failed' | 'not_run';
  durationMs: number;
  /** Sanitised error output when failed. */
  errorSummary?: string;
}

export interface RunReport {
  merchantId: string;
  kind: RunKind;
  agentId: string | null;
  runId: string | null;
  status: RunStatus;
  model: string | null;
  durationMs: number;
  changedFiles: FileChange[];
  /** Paths outside the editable areas that the run changed (all restored). */
  protectedViolations: FileChange[];
  restoredFiles: string[];
  build: BuildReport;
  /** Per-run tokens from run.wait().usage; null when Cursor did not report usage. */
  usage: TokenTotals | null;
  /** This run's cost (agent total after minus before). null until Cursor reports it — never estimated. */
  cost: CostReport | null;
  costPending: boolean;
  /** agent.getUsage() totals for the whole agent, for cross-checking. */
  agentUsageTotal: { usage: TokenTotals; cost: CostReport | null } | null;
  hookDecisions: { allow: number; deny: number } | null;
  errorMessage?: string;
  notes: string[];
}

export interface PipelineReport {
  merchantId: string;
  agentId: string | null;
  /** succeeded = agent finished, no protected file touched, final build passed. */
  status: 'succeeded' | 'failed';
  failureReason?: string;
  startedAt: string;
  durationMs: number;
  runs: RunReport[];
  totals: { usage: TokenTotals | null; cost: CostReport | null; costPending: boolean };
  finalBuild: BuildReport;
  changedFiles: FileChange[];
  autoPublished: false;
  workspaceDir: string;
}

export function toTokenTotals(u: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
}): TokenTotals {
  return {
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheReadTokens: u.cacheReadTokens,
    cacheWriteTokens: u.cacheWriteTokens,
    cacheTokens: u.cacheReadTokens + u.cacheWriteTokens,
    totalTokens: u.totalTokens,
    ...(u.reasoningTokens !== undefined ? { reasoningTokens: u.reasoningTokens } : {}),
  };
}

/** Sum of run-level numbers only; null if no run reported usage. Cost is summed only when every run has one. */
export function aggregateTotals(runs: RunReport[]): PipelineReport['totals'] {
  const withUsage = runs.filter((r) => r.usage);
  const usage = withUsage.length
    ? withUsage.reduce<TokenTotals>(
        (acc, r) => ({
          inputTokens: acc.inputTokens + r.usage!.inputTokens,
          outputTokens: acc.outputTokens + r.usage!.outputTokens,
          cacheReadTokens: acc.cacheReadTokens + r.usage!.cacheReadTokens,
          cacheWriteTokens: acc.cacheWriteTokens + r.usage!.cacheWriteTokens,
          cacheTokens: acc.cacheTokens + r.usage!.cacheTokens,
          totalTokens: acc.totalTokens + r.usage!.totalTokens,
        }),
        { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheTokens: 0, totalTokens: 0 },
      )
    : null;
  const agentRuns = runs.filter((r) => r.runId !== null);
  const allCosted = agentRuns.length > 0 && agentRuns.every((r) => r.cost !== null);
  const cost = allCosted
    ? agentRuns.reduce<CostReport>(
        (acc, r) => ({ chargedCents: acc.chargedCents + r.cost!.chargedCents, rawCostCents: acc.rawCostCents + r.cost!.rawCostCents }),
        { chargedCents: 0, rawCostCents: 0 },
      )
    : null;
  return { usage, cost, costPending: agentRuns.length > 0 && !allCosted };
}

export async function writeReport(paths: WorkspacePaths, report: PipelineReport): Promise<string> {
  await fs.mkdir(paths.runsDir, { recursive: true });
  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const file = path.join(paths.runsDir, `${stamp}.json`);
  await fs.writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}

const fmtCents = (c: number) => `${(c / 100).toFixed(4)} USD (${c.toFixed(2)}¢)`;

export function formatReport(report: PipelineReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`Result: ${report.status.toUpperCase()}${report.failureReason ? ` — ${report.failureReason}` : ''}`);
  lines.push(`  merchant     ${report.merchantId}`);
  lines.push(`  agentId      ${report.agentId ?? '-'}`);
  lines.push(`  duration     ${(report.durationMs / 1000).toFixed(1)}s`);
  lines.push(`  final build  ${report.finalBuild.status}`);
  lines.push(`  published    no (this PoC never publishes)`);
  for (const [i, r] of report.runs.entries()) {
    lines.push(`  run ${i + 1} (${r.kind})`);
    lines.push(`    runId ${r.runId ?? '-'}  status ${r.status}  model ${r.model ?? '-'}  ${(r.durationMs / 1000).toFixed(1)}s`);
    lines.push(`    build ${r.build.status}${r.protectedViolations.length ? `  PROTECTED FILES TOUCHED: ${r.protectedViolations.map((v) => v.path).join(', ')}` : ''}`);
    if (r.usage) {
      lines.push(
        `    tokens in ${r.usage.inputTokens}  out ${r.usage.outputTokens}  cache ${r.usage.cacheTokens} (read ${r.usage.cacheReadTokens}, write ${r.usage.cacheWriteTokens})  total ${r.usage.totalTokens}`,
      );
    } else {
      lines.push('    tokens not reported by Cursor');
    }
    lines.push(
      r.cost
        ? `    cost charged ${fmtCents(r.cost.chargedCents)}  raw ${fmtCents(r.cost.rawCostCents)}`
        : `    cost pending: Cursor has not reported cost yet (not estimated)`,
    );
    if (r.hookDecisions) lines.push(`    hook decisions allow ${r.hookDecisions.allow}  deny ${r.hookDecisions.deny}`);
    if (r.errorMessage) lines.push(`    error ${r.errorMessage}`);
  }
  lines.push('  changed files');
  if (report.changedFiles.length === 0) lines.push('    (none)');
  for (const c of report.changedFiles) lines.push(`    ${c.change.padEnd(8)} ${c.path}`);
  const t = report.totals;
  lines.push('  totals');
  lines.push(
    t.usage
      ? `    tokens in ${t.usage.inputTokens}  out ${t.usage.outputTokens}  cache ${t.usage.cacheTokens}  total ${t.usage.totalTokens}`
      : '    tokens not reported',
  );
  lines.push(t.cost ? `    cost charged ${fmtCents(t.cost.chargedCents)}  raw ${fmtCents(t.cost.rawCostCents)}` : `    cost ${t.costPending ? 'pending (not estimated)' : 'n/a'}`);
  return lines.join('\n');
}
