import fs from 'node:fs/promises';
import path from 'node:path';
import { buildStorefront } from './buildStorefront.ts';
import { DEFAULT_AGENT_TIMEOUT_MS, DEFAULT_BUILD_TIMEOUT_MS, MAX_REPAIR_RUNS, TEMPLATE_DIR } from './config.ts';
import {
  createWorkspace,
  generatedFiles,
  readState,
  resolveWorkspacePaths,
  workspaceExists,
  writeState,
  type WorkspacePaths,
  type WorkspaceState,
} from './createWorkspace.ts';
import { wrapDesignPrompt, wrapRepairPrompt } from './prompt.ts';
import {
  SafetyError,
  assertWorkspaceClean,
  diffSnapshots,
  evaluateRun,
  protectedSubset,
  restoreProtected,
  snapshotWorkspace,
  type FileChange,
} from './protectedFiles.ts';
import { aggregateTotals, writeReport, type BuildReport, type PipelineReport, type RunKind, type RunReport } from './report.ts';
import { MissingApiKeyError, type AgentDriver, type DriverResult } from './runAgent.ts';
import { sanitizeText } from './sanitize.ts';

export interface PipelineOptions {
  merchantId: string;
  prompt: string;
  kind: 'generate' | 'followup';
  driver: AgentDriver;
  root?: string;
  templateDir?: string;
  nodeModules?: 'copy' | 'skip';
  agentTimeoutMs?: number;
  buildTimeoutMs?: number;
  log?: (line: string) => void;
  /** Test hook: replaces the real build. */
  buildFn?: typeof buildStorefront;
}

async function hookLogSize(paths: WorkspacePaths): Promise<number> {
  try {
    return (await fs.stat(paths.hookLog)).size;
  } catch {
    return 0;
  }
}

async function hookDecisionsSince(paths: WorkspacePaths, offset: number): Promise<{ allow: number; deny: number } | null> {
  try {
    const buf = await fs.readFile(paths.hookLog, 'utf8');
    const lines = buf.slice(offset).split('\n').filter(Boolean);
    let allow = 0;
    let deny = 0;
    for (const l of lines) {
      try {
        const j = JSON.parse(l) as { permission?: string };
        if (j.permission === 'allow') allow++;
        else if (j.permission === 'deny') deny++;
      } catch {
        /* ignore partial line */
      }
    }
    return { allow, deny };
  } catch {
    return null;
  }
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineReport> {
  const log = opts.log ?? (() => undefined);
  const build = opts.buildFn ?? buildStorefront;
  const paths = resolveWorkspacePaths(opts.merchantId, opts.root);
  // Validate (and wrap) the prompt before anything touches the disk.
  const firstPrompt = wrapDesignPrompt(opts.prompt, opts.kind);
  const startedAt = new Date();

  let state: WorkspaceState;
  if (opts.kind === 'generate') {
    if (await workspaceExists(paths)) {
      throw new SafetyError(`workspace for "${paths.merchantId}" already exists. Use "followup" to edit it or "reset" to start over.`);
    }
    log(`creating workspace for ${paths.merchantId}`);
    state = (await createWorkspace({ merchantId: opts.merchantId, root: opts.root, templateDir: opts.templateDir, nodeModules: opts.nodeModules })).state;
  } else {
    state = await readState(paths);
    if (!state.agentId) throw new SafetyError(`no Cursor agent recorded for "${paths.merchantId}"; run generate first`);
  }

  const templateDir = path.resolve(opts.templateDir ?? TEMPLATE_DIR);
  const startSnap = await snapshotWorkspace(paths.workspaceDir);
  assertWorkspaceClean(startSnap);

  async function attempt(kind: RunKind, prompt: string): Promise<RunReport> {
    const notes: string[] = [];
    // ---- preflight ----
    let pre = await snapshotWorkspace(paths.workspaceDir);
    assertWorkspaceClean(pre);
    const drift = diffSnapshots(state.protectedBaseline, protectedSubset(pre.files));
    if (drift.length) {
      const restored = await restoreProtected(paths.workspaceDir, templateDir, { violations: drift, symlinks: [], credentialFiles: [] }, generatedFiles(paths));
      notes.push(`protected files had drifted from the trusted baseline before the run and were restored: ${restored.join(', ')}`);
      pre = await snapshotWorkspace(paths.workspaceDir);
    }
    const logOffset = await hookLogSize(paths);

    // ---- agent ----
    let driven: DriverResult;
    try {
      driven = await opts.driver({
        paths,
        agentId: state.agentId,
        prompt,
        timeoutMs: opts.agentTimeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
        log,
        onAgentId: async (id) => {
          state.agentId = id;
          await writeState(paths, state);
        },
      });
    } catch (err) {
      if (err instanceof MissingApiKeyError) throw err;
      driven = {
        agentId: state.agentId,
        runId: null,
        status: 'error',
        model: null,
        durationMs: 0,
        usage: null,
        cost: null,
        costPending: false,
        agentUsageTotal: null,
        errorMessage: sanitizeText(err instanceof Error ? err.message : String(err), { workspaceDir: paths.workspaceDir, maxChars: 400 }),
      };
    }
    if (driven.agentId && driven.agentId !== state.agentId) {
      state.agentId = driven.agentId;
      await writeState(paths, state);
    }

    // ---- verification (independent of whether hooks ran) ----
    const post = await snapshotWorkspace(paths.workspaceDir);
    const evaluation = evaluateRun(pre.files, post);
    let restoredFiles: string[] = [];
    let status: RunReport['status'] = driven.status;
    if (evaluation.failed) {
      status = 'protected_files_touched';
      restoredFiles = await restoreProtected(paths.workspaceDir, templateDir, evaluation, generatedFiles(paths));
      const after = await snapshotWorkspace(paths.workspaceDir);
      const still = diffSnapshots(state.protectedBaseline, protectedSubset(after.files));
      if (still.length || after.symlinks.length || after.credentialFiles.length) {
        notes.push(`restoration incomplete for: ${[...still.map((s) => s.path), ...after.symlinks, ...after.credentialFiles].join(', ')} — reset this workspace`);
      }
    }

    // ---- build ----
    let buildReport: BuildReport = { status: 'not_run', durationMs: 0 };
    if (status === 'finished') {
      log('running storefront build');
      const b = await build(paths.workspaceDir, { timeoutMs: opts.buildTimeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS });
      buildReport = b.ok
        ? { status: 'passed', durationMs: b.durationMs }
        : { status: 'failed', durationMs: b.durationMs, errorSummary: b.output };
    }

    return {
      merchantId: paths.merchantId,
      kind,
      agentId: driven.agentId,
      runId: driven.runId,
      status,
      model: driven.model,
      durationMs: driven.durationMs,
      changedFiles: evaluation.changed,
      protectedViolations: evaluation.violations,
      restoredFiles,
      build: buildReport,
      usage: driven.usage,
      cost: driven.cost,
      costPending: driven.costPending,
      agentUsageTotal: driven.agentUsageTotal,
      hookDecisions: await hookDecisionsSince(paths, logOffset),
      ...(driven.errorMessage ? { errorMessage: driven.errorMessage } : {}),
      notes,
    };
  }

  const runs: RunReport[] = [await attempt(opts.kind, firstPrompt)];
  // At most MAX_REPAIR_RUNS repair runs, and only for a clean agent run whose build failed.
  for (let i = 0; i < MAX_REPAIR_RUNS; i++) {
    const last = runs[runs.length - 1]!;
    if (last.status === 'finished' && last.build.status === 'failed') {
      log('build failed; starting the single allowed repair run');
      runs.push(await attempt('repair', wrapRepairPrompt(last.build.errorSummary ?? 'build failed')));
    }
  }

  const last = runs[runs.length - 1]!;
  const anyViolation = runs.some((r) => r.status === 'protected_files_touched');
  let failureReason: string | undefined;
  if (anyViolation) failureReason = 'protected files were modified (restored from the trusted template)';
  else if (last.status !== 'finished') failureReason = `agent run ${last.status}${last.errorMessage ? `: ${last.errorMessage}` : ''}`;
  else if (last.build.status !== 'passed') failureReason = 'storefront build failed after the allowed repair attempt';

  const finalSnap = await snapshotWorkspace(paths.workspaceDir);
  const changedFiles: FileChange[] = diffSnapshots(startSnap.files, finalSnap.files);
  const report: PipelineReport = {
    merchantId: paths.merchantId,
    agentId: state.agentId,
    status: failureReason ? 'failed' : 'succeeded',
    ...(failureReason ? { failureReason } : {}),
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    runs,
    totals: aggregateTotals(runs),
    finalBuild: last.build,
    changedFiles,
    autoPublished: false,
    workspaceDir: paths.workspaceDir,
  };
  const file = await writeReport(paths, report);
  state.runs.push(path.basename(file));
  await writeState(paths, state);
  return report;
}
