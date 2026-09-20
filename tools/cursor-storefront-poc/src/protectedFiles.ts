import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EDITABLE_PREFIXES, NODE_MODULES_LOCK, SNAPSHOT_IGNORED_TOP_LEVEL } from './config.ts';
import { isEditableRel, isSensitiveName } from '../hooks/guardPolicy.mjs';

export class SafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafetyError';
  }
}

// ---- identifiers & paths -------------------------------------------------------------

const MERCHANT_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** Strict slug: lowercase alphanumerics and single hyphens, 1-40 chars, no dots or slashes. */
export function validateMerchantId(id: unknown): string {
  if (typeof id !== 'string') throw new SafetyError('merchant id must be a string');
  if (!MERCHANT_ID.test(id) || id.includes('--')) {
    throw new SafetyError(
      `invalid merchant id "${String(id).slice(0, 60)}": use 1-40 chars of a-z, 0-9 and single hyphens (no leading/trailing hyphen)`,
    );
  }
  return id;
}

/** Normalise a workspace-relative path; throws on traversal, absolute paths, NULs, backslashes. */
export function assertSafeRelativePath(rel: string): string {
  if (typeof rel !== 'string' || rel === '') throw new SafetyError('empty path');
  if (rel.includes('\0') || rel.includes('\\')) throw new SafetyError(`unsafe path: ${JSON.stringify(rel)}`);
  if (path.isAbsolute(rel) || rel.startsWith('~')) throw new SafetyError(`absolute path not allowed: ${rel}`);
  const norm = path.posix.normalize(rel);
  if (norm === '..' || norm.startsWith('../') || norm.split('/').includes('..')) {
    throw new SafetyError(`path traversal rejected: ${rel}`);
  }
  return norm;
}

/** Join a relative path onto a base directory, guaranteeing the result stays inside it. */
export function safeJoin(baseDir: string, rel: string): string {
  const norm = assertSafeRelativePath(rel);
  const base = path.resolve(baseDir);
  const abs = path.resolve(base, norm);
  const back = path.relative(base, abs);
  if (back === '' || back.startsWith('..') || path.isAbsolute(back)) {
    throw new SafetyError(`path escapes its directory: ${rel}`);
  }
  return abs;
}

export function isEditablePath(rel: string): boolean {
  try {
    return isEditableRel(assertSafeRelativePath(rel));
  } catch {
    return false;
  }
}

// ---- snapshots ------------------------------------------------------------------------

export interface FileEntry {
  hash: string;
  size: number;
}
export type Snapshot = Record<string, FileEntry>;

export interface SnapshotResult {
  files: Snapshot;
  /** Any symlink anywhere outside node_modules is a hard violation. */
  symlinks: string[];
  /** .env*, key/credential-looking files anywhere outside node_modules. */
  credentialFiles: string[];
}

async function hashFile(abs: string): Promise<FileEntry> {
  const buf = await fs.readFile(abs);
  return { hash: createHash('sha256').update(buf).digest('hex'), size: buf.length };
}

/** Hash every regular file in the workspace (never following symlinks). */
export async function snapshotWorkspace(dir: string): Promise<SnapshotResult> {
  const root = path.resolve(dir);
  const result: SnapshotResult = { files: {}, symlinks: [], credentialFiles: [] };

  async function walk(abs: string, rel: string): Promise<void> {
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = path.join(abs, entry.name);
      if (rel === '' && SNAPSHOT_IGNORED_TOP_LEVEL.includes(entry.name)) continue;
      if (entry.isSymbolicLink()) {
        result.symlinks.push(childRel);
        continue;
      }
      if (isSensitiveName(entry.name) && entry.name !== '.gitignore') result.credentialFiles.push(childRel);
      if (entry.isDirectory()) await walk(childAbs, childRel);
      else if (entry.isFile()) result.files[childRel] = await hashFile(childAbs);
    }
  }

  await walk(root, '');
  const lock = path.join(root, NODE_MODULES_LOCK);
  try {
    const st = await fs.lstat(lock);
    if (st.isFile()) result.files[NODE_MODULES_LOCK] = await hashFile(lock);
  } catch {
    /* no node_modules lock (e.g. tests that skip node_modules) */
  }
  result.symlinks.sort();
  result.credentialFiles.sort();
  return result;
}

export type ChangeKind = 'added' | 'modified' | 'deleted';
export interface FileChange {
  path: string;
  change: ChangeKind;
}

export function diffSnapshots(before: Snapshot, after: Snapshot): FileChange[] {
  const changes: FileChange[] = [];
  for (const [p, e] of Object.entries(after)) {
    const b = before[p];
    if (!b) changes.push({ path: p, change: 'added' });
    else if (b.hash !== e.hash) changes.push({ path: p, change: 'modified' });
  }
  for (const p of Object.keys(before)) if (!after[p]) changes.push({ path: p, change: 'deleted' });
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

/** Files outside the editable areas (what we hash as "protected"). */
export function protectedSubset(files: Snapshot): Snapshot {
  const out: Snapshot = {};
  for (const [p, e] of Object.entries(files)) if (!isEditablePath(p)) out[p] = e;
  return out;
}

export interface RunEvaluation {
  changed: FileChange[];
  /** Changes outside the editable paths. */
  violations: FileChange[];
  symlinks: string[];
  credentialFiles: string[];
  /** True when the run must be marked failed. */
  failed: boolean;
}

/** Compare the pre-run snapshot with the post-run state and classify every change. */
export function evaluateRun(before: Snapshot, after: SnapshotResult): RunEvaluation {
  const changed = diffSnapshots(before, after.files);
  const violations = changed.filter((c) => !isEditablePath(c.path));
  return {
    changed,
    violations,
    symlinks: after.symlinks,
    credentialFiles: after.credentialFiles,
    failed: violations.length > 0 || after.symlinks.length > 0 || after.credentialFiles.length > 0,
  };
}

/** Throw if the workspace is not safe to hand to an agent. */
export function assertWorkspaceClean(snap: SnapshotResult): void {
  if (snap.symlinks.length) throw new SafetyError(`workspace contains symlinks: ${snap.symlinks.slice(0, 5).join(', ')}`);
  if (snap.credentialFiles.length) {
    throw new SafetyError(`workspace contains credential-like files: ${snap.credentialFiles.slice(0, 5).join(', ')}`);
  }
}

// ---- restoration ----------------------------------------------------------------------

/**
 * Put every violating path back to trusted content. Trusted sources, in order: the template
 * directory, then `generated` (files the PoC writes itself, e.g. .cursor/hooks.json). Anything
 * with no trusted source that was added is removed. Symlinks and credential files are unlinked.
 * Returns the paths that were touched.
 */
export async function restoreProtected(
  workspaceDir: string,
  templateDir: string,
  eval_: Pick<RunEvaluation, 'violations' | 'symlinks' | 'credentialFiles'>,
  generated: Record<string, string> = {},
): Promise<string[]> {
  const restored: string[] = [];
  const remove = async (rel: string) => {
    await fs.rm(safeJoin(workspaceDir, rel), { force: true, recursive: false }).catch(() => undefined);
  };

  for (const rel of [...eval_.symlinks, ...eval_.credentialFiles]) {
    await remove(rel);
    restored.push(rel);
  }
  for (const v of eval_.violations) {
    const target = safeJoin(workspaceDir, v.path);
    const trustedInTemplate = safeJoin(templateDir, v.path);
    if (v.path in generated) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, generated[v.path]!, 'utf8');
    } else if (await isRegularFile(trustedInTemplate)) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(trustedInTemplate, target);
    } else {
      await remove(v.path);
    }
    restored.push(v.path);
  }
  return [...new Set(restored)].sort();
}

async function isRegularFile(p: string): Promise<boolean> {
  try {
    return (await fs.lstat(p)).isFile();
  } catch {
    return false;
  }
}

export { EDITABLE_PREFIXES };
