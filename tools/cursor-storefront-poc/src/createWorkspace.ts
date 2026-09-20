import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_WORKSPACES_ROOT,
  GUARD_SCRIPT,
  ROOT_MARKER,
  SNAPSHOT_IGNORED_TOP_LEVEL,
  STATE_FILE,
  TEMPLATE_DIR,
} from './config.ts';
import {
  SafetyError,
  assertWorkspaceClean,
  protectedSubset,
  safeJoin,
  snapshotWorkspace,
  validateMerchantId,
  type Snapshot,
} from './protectedFiles.ts';

/**
 * Layout (everything the agent must not touch lives OUTSIDE its cwd):
 *   <root>/<merchant>/workspace/     ← agent cwd (the storefront project)
 *   <root>/<merchant>/state.json     ← agent id, trusted baseline hashes
 *   <root>/<merchant>/agent-store/   ← Cursor local agent store (JSONL)
 *   <root>/<merchant>/runs/          ← per-run JSON reports
 *   <root>/<merchant>/hook-log.jsonl ← every hook decision
 */
export interface WorkspacePaths {
  root: string;
  merchantId: string;
  merchantDir: string;
  workspaceDir: string;
  stateFile: string;
  agentStoreDir: string;
  runsDir: string;
  hookLog: string;
}

export interface WorkspaceState {
  version: 1;
  merchantId: string;
  createdAt: string;
  agentId: string | null;
  /** Full file list + hashes at creation. */
  baseline: Snapshot;
  /** Hashes of every non-editable file at creation (the trusted set). */
  protectedBaseline: Snapshot;
  runs: string[];
}

export function resolveWorkspacePaths(merchantId: string, root: string = DEFAULT_WORKSPACES_ROOT): WorkspacePaths {
  const id = validateMerchantId(merchantId);
  const rootAbs = path.resolve(root);
  const merchantDir = path.join(rootAbs, id);
  const back = path.relative(rootAbs, merchantDir);
  if (back !== id) throw new SafetyError('merchant directory does not resolve directly under the workspaces root');
  return {
    root: rootAbs,
    merchantId: id,
    merchantDir,
    workspaceDir: path.join(merchantDir, 'workspace'),
    stateFile: path.join(merchantDir, STATE_FILE),
    agentStoreDir: path.join(merchantDir, 'agent-store'),
    runsDir: path.join(merchantDir, 'runs'),
    hookLog: path.join(merchantDir, 'hook-log.jsonl'),
  };
}

const q = (s: string) => JSON.stringify(s);

/** Files the PoC writes into every workspace; also the trusted source when restoring them. */
export function generatedFiles(paths: WorkspacePaths): Record<string, string> {
  const command = `${q(process.execPath)} ${q(GUARD_SCRIPT)} --workspace ${q(paths.workspaceDir)} --log ${q(paths.hookLog)}`;
  const entry = { command, type: 'command', timeout: 15, failClosed: true };
  // Schema: https://cursor.com/docs/hooks (version 1; events beforeShellExecution, beforeReadFile, preToolUse).
  const hooks = {
    version: 1,
    hooks: {
      beforeShellExecution: [entry],
      beforeReadFile: [entry],
      preToolUse: [entry],
    },
  };
  // Schema: https://cursor.com/docs/reference/permissions. `autoRun` only steers the Auto-review
  // classifier (advisory); enforcement comes from the hooks above and the post-run verification.
  const permissions = {
    autoRun: {
      allow_instructions: ['Running "npm run build" or "npx tsc --noEmit" inside the workspace.', 'Read-only inspection (ls, cat, grep, rg, find) inside the workspace.'],
      block_instructions: [
        'Any git, supabase, vercel, curl, wget, ssh, or network command.',
        'Any command that installs, removes, updates or publishes npm packages.',
        'Any command or file access outside the workspace directory.',
        'Any change to package.json, lockfiles, vite/tsconfig files, scripts, .cursor, .env files, or src/speedvendors.',
      ],
    },
  };
  return {
    '.cursor/hooks.json': `${JSON.stringify(hooks, null, 2)}\n`,
    '.cursor/permissions.json': `${JSON.stringify(permissions, null, 2)}\n`,
  };
}

export interface CreateWorkspaceOptions {
  merchantId: string;
  root?: string;
  templateDir?: string;
  /** 'copy' (default) copies template/node_modules; 'skip' leaves the workspace without deps. */
  nodeModules?: 'copy' | 'skip';
}

export async function ensureRoot(root: string): Promise<void> {
  const rootAbs = path.resolve(root);
  if (rootAbs === path.parse(rootAbs).root || rootAbs === os.homedir()) {
    throw new SafetyError(`refusing to use ${rootAbs} as a workspaces root`);
  }
  await fs.mkdir(rootAbs, { recursive: true });
  await fs.writeFile(path.join(rootAbs, ROOT_MARKER), 'SpeedVendors Cursor storefront PoC workspaces. Safe to delete.\n', { flag: 'a' });
}

export async function workspaceExists(paths: WorkspacePaths): Promise<boolean> {
  try {
    await fs.access(paths.stateFile);
    return true;
  } catch {
    return false;
  }
}

export async function readState(paths: WorkspacePaths): Promise<WorkspaceState> {
  let raw: string;
  try {
    raw = await fs.readFile(paths.stateFile, 'utf8');
  } catch {
    throw new SafetyError(`no workspace for merchant "${paths.merchantId}" (run generate or create first)`);
  }
  return JSON.parse(raw) as WorkspaceState;
}

export async function writeState(paths: WorkspacePaths, state: WorkspaceState): Promise<void> {
  await fs.writeFile(paths.stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function createWorkspace(opts: CreateWorkspaceOptions): Promise<{ paths: WorkspacePaths; state: WorkspaceState }> {
  const paths = resolveWorkspacePaths(opts.merchantId, opts.root);
  const templateDir = path.resolve(opts.templateDir ?? TEMPLATE_DIR);
  if (await workspaceExists(paths)) {
    throw new SafetyError(`workspace for "${paths.merchantId}" already exists; reset it or use followup`);
  }
  await ensureRoot(paths.root);

  // The template itself must be trustworthy: no symlinks, no credential-like files.
  assertWorkspaceClean(await snapshotWorkspace(templateDir));

  await fs.rm(paths.merchantDir, { recursive: true, force: true }); // leftover partial dir from a failed create
  await fs.mkdir(paths.workspaceDir, { recursive: true });
  await fs.mkdir(paths.runsDir, { recursive: true });
  await fs.mkdir(paths.agentStoreDir, { recursive: true });

  await fs.cp(templateDir, paths.workspaceDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(templateDir, src);
      const top = rel.split(path.sep)[0] ?? '';
      return !SNAPSHOT_IGNORED_TOP_LEVEL.includes(top);
    },
  });

  if ((opts.nodeModules ?? 'copy') === 'copy') {
    const nm = path.join(templateDir, 'node_modules');
    try {
      await fs.access(nm);
    } catch {
      throw new SafetyError('template dependencies are not installed. Run: npm run setup');
    }
    // Real copy (never a symlink into the main repository); relative .bin links stay relative.
    await fs.cp(nm, path.join(paths.workspaceDir, 'node_modules'), { recursive: true, verbatimSymlinks: true });
  }

  for (const [rel, content] of Object.entries(generatedFiles(paths))) {
    const abs = safeJoin(paths.workspaceDir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
  }

  const snap = await snapshotWorkspace(paths.workspaceDir);
  assertWorkspaceClean(snap);
  const state: WorkspaceState = {
    version: 1,
    merchantId: paths.merchantId,
    createdAt: new Date().toISOString(),
    agentId: null,
    baseline: snap.files,
    protectedBaseline: protectedSubset(snap.files),
    runs: [],
  };
  await writeState(paths, state);
  return { paths, state };
}

/**
 * Delete ONE merchant's disposable workspace. Every check must pass before anything is removed:
 * valid slug, root carries our marker, directory sits directly under root, is a real directory
 * (not a symlink), resolves inside the real root, and contains our state file.
 */
export async function resetWorkspace(merchantId: string, root: string = DEFAULT_WORKSPACES_ROOT): Promise<string> {
  const paths = resolveWorkspacePaths(merchantId, root);
  try {
    await fs.access(path.join(paths.root, ROOT_MARKER));
  } catch {
    throw new SafetyError(`${paths.root} is not a SpeedVendors workspaces root (marker missing); refusing to delete`);
  }
  if (paths.root === path.parse(paths.root).root || paths.root === os.homedir()) {
    throw new SafetyError('refusing to operate on this root');
  }
  let st;
  try {
    st = await fs.lstat(paths.merchantDir);
  } catch {
    throw new SafetyError(`no workspace for "${paths.merchantId}"`);
  }
  if (st.isSymbolicLink() || !st.isDirectory()) throw new SafetyError('workspace path is not a plain directory; refusing to delete');
  const realRoot = await fs.realpath(paths.root);
  const realDir = await fs.realpath(paths.merchantDir);
  if (path.dirname(realDir) !== realRoot) throw new SafetyError('workspace resolves outside the workspaces root; refusing to delete');
  try {
    await fs.access(paths.stateFile);
  } catch {
    throw new SafetyError('workspace state file missing; refusing to delete an unrecognised directory');
  }
  await fs.rm(realDir, { recursive: true, force: true });
  return realDir;
}
