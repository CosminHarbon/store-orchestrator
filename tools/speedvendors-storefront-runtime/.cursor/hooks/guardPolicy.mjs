// @ts-check
// Pure decision logic for the Cursor hook guard. Runs inside the hook process (plain
// Node, no build step, no dependencies) and is also imported by the PoC and its tests.
//
// Hook input/output shapes follow https://cursor.com/docs/hooks (events used:
// beforeShellExecution, beforeReadFile, preToolUse). This is DEFENCE IN DEPTH, not the
// only control: the authoritative check is the post-run hash verification in
// src/protectedFiles.ts, which does not depend on the hooks being invoked at all.
import fs from 'node:fs';
import path from 'node:path';

/** Workspace-relative prefixes Cursor may create/edit/delete files under. */
export const EDITABLE_PREFIXES = [
  'src/storefront/',
  'src/components/',
  'src/styles/',
  'public/',
  'artifacts/',
];

/**
 * @typedef {{ permission: 'allow' | 'deny', user_message?: string, agent_message?: string }} Decision
 * @typedef {{ workspace: string }} Ctx
 */

/** @param {string} reason @returns {Decision} */
const deny = (reason) => ({
  permission: 'deny',
  user_message: `Blocked by SpeedVendors storefront policy: ${reason}`,
  agent_message: `Blocked by SpeedVendors storefront policy: ${reason}. Only edit src/storefront/, src/components/, src/styles/, public/, and artifacts/, and only run the storefront build ("npm run build") or read-only inspection commands inside the workspace.`,
});

/** @type {Decision} */
const ALLOW = { permission: 'allow' };

/** @param {string} rel posix-normalised workspace-relative path */
export function isEditableRel(rel) {
  if (!rel || rel.startsWith('/') || rel.includes('\0')) return false;
  const parts = rel.split('/');
  if (parts.some((p) => p === '..' || p === '')) return false;
  // Strictly inside a prefix directory: the directory itself ("src/storefront") is not a writable target.
  return EDITABLE_PREFIXES.some((p) => rel.startsWith(p));
}

/** @param {string} p */
export function isSensitiveName(p) {
  return p
    .split(/[\\/]+/)
    .some(
      (seg) =>
        /^\.env/i.test(seg) ||
        seg === '.git' ||
        seg === '.ssh' ||
        seg === '.aws' ||
        seg === '.npmrc' ||
        seg === '.netrc' ||
        /^id_(rsa|ed25519|ecdsa|dsa)/i.test(seg) ||
        /\.pem$/i.test(seg) ||
        /^credentials/i.test(seg),
    );
}

/** Resolve through symlinks for the deepest existing ancestor, then re-append the rest. @param {string} abs */
function realResolve(abs) {
  let current = abs;
  /** @type {string[]} */
  const rest = [];
  for (;;) {
    try {
      const real = fs.realpathSync(current);
      return path.join(real, ...rest.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return abs;
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * @param {string} workspace absolute workspace path
 * @param {string} target path as given by the agent (absolute or relative)
 * @param {string} base directory relative targets are resolved against
 * @returns {{ inside: boolean, rel: string, abs: string }}
 */
export function locate(workspace, target, base) {
  const ws = realResolve(path.resolve(workspace));
  const abs = realResolve(path.resolve(base || ws, target));
  const relNative = path.relative(ws, abs);
  const inside = relNative === '' || (!relNative.startsWith('..') && !path.isAbsolute(relNative));
  return { inside, rel: relNative.split(path.sep).join('/'), abs };
}

/** @param {string} p @param {'read' | 'write'} mode @param {Ctx} ctx @param {string} base @returns {Decision} */
export function pathDecision(p, mode, ctx, base) {
  if (typeof p !== 'string' || p === '' || p.includes('\0')) return deny('empty or invalid path');
  if (p.startsWith('~')) return deny(`path outside the workspace (${clip(p)})`);
  // Cursor Cloud Artifacts mount — files here are uploaded to the Artifacts API (S3).
  // Workspace-relative artifacts/ alone does NOT populate GET /v1/agents/{id}/artifacts.
  const normalized = p.replace(/\\/g, '/');
  if (
    normalized === '/opt/cursor/artifacts' ||
    normalized.startsWith('/opt/cursor/artifacts/')
  ) {
    return ALLOW;
  }
  const { inside, rel } = locate(ctx.workspace, p, base);
  if (!inside) return deny(`path outside the workspace (${clip(p)})`);
  if (isSensitiveName(rel)) return deny(`credential-like or VCS path (${clip(rel)})`);
  if (mode === 'write' && !isEditableRel(rel)) return deny(`${clip(rel)} is a protected file`);
  return ALLOW;
}

/** @param {string} s */
function clip(s) {
  return String(s).length > 80 ? `${String(s).slice(0, 77)}...` : String(s);
}

// ---- shell -----------------------------------------------------------------------

const BLOCKED_PROGRAMS = new Set([
  'git', 'supabase', 'vercel', 'curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'nc', 'ncat', 'telnet',
  'sudo', 'su', 'rm', 'rmdir', 'mv', 'cp', 'dd', 'mkfs', 'chmod', 'chown', 'shred', 'truncate', 'ln',
  'kill', 'pkill', 'killall', 'open', 'osascript', 'python', 'python3', 'node', 'deno', 'bun', 'pnpm',
  'yarn', 'pip', 'pip3', 'brew', 'docker', 'aws', 'gcloud', 'gh', 'bash', 'sh', 'zsh', 'env', 'eval',
]);

const READ_ONLY_PROGRAMS = new Set(['ls', 'pwd', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find']);
const FIND_FORBIDDEN = new Set(['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprintf', '-fls']);

/** Quote-aware splitter. Returns null for unbalanced quotes. @param {string} s @returns {string[] | null} */
function splitArgs(s) {
  /** @type {string[]} */
  const out = [];
  let cur = '';
  let quote = '';
  let has = false;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = '';
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += ch;
      has = true;
    }
  }
  if (quote) return null;
  if (has || cur) out.push(cur);
  return out;
}

/** @param {string} command @param {string | undefined} cwd @param {Ctx} ctx @returns {Decision} */
export function shellDecision(command, cwd, ctx) {
  if (typeof command !== 'string' || command.trim() === '') return deny('empty command');
  const base = cwd || ctx.workspace;
  if (!locate(ctx.workspace, base, ctx.workspace).inside) return deny('command working directory is outside the workspace');

  // Permit only a trailing stderr redirect; every other shell metacharacter is refused.
  const cleaned = command.trim().replace(/\s+2>&1$/, '');
  if (/[;&|<>`$(){}\\\n\r]/.test(cleaned)) {
    return deny('shell chaining, redirection, substitution and variables are not allowed (run one plain command)');
  }
  const args = splitArgs(cleaned);
  if (!args || args.length === 0) return deny('could not parse command');
  const prog = args[0];
  if (prog === undefined) return deny('could not parse command');
  if (prog.includes('/')) return deny('programs must be invoked by bare name');
  const progName = path.basename(prog);
  if (BLOCKED_PROGRAMS.has(progName)) return deny(`"${progName}" commands are not allowed`);

  if (progName === 'npm') {
    if (args.length === 3 && args[1] === 'run' && args[2] === 'build') return ALLOW;
    return deny('only "npm run build" is allowed (no installs, publishing, scripts or config changes)');
  }
  if (progName === 'npx') {
    const rest = args.slice(1).join(' ');
    if (rest === 'tsc --noEmit' || rest === 'tsc --noEmit -p tsconfig.json') return ALLOW;
    return deny('only "npx tsc --noEmit" is allowed');
  }
  if (!READ_ONLY_PROGRAMS.has(progName)) return deny(`"${progName}" is not an allowed command`);
  if (progName === 'find' && args.some((a) => FIND_FORBIDDEN.has(a))) return deny('find actions that modify files are not allowed');

  for (const a of args.slice(1)) {
    if (isSensitiveName(a)) return deny(`credential-like or VCS path (${clip(a)})`);
    const pathLike = a.startsWith('/') || a.startsWith('~') || a.split('/').includes('..');
    if (pathLike) {
      const d = pathDecision(a, 'read', ctx, base);
      if (d.permission === 'deny') return d;
    }
  }
  return ALLOW;
}

// ---- tools -------------------------------------------------------------------------

const DENIED_TOOLS = /^(task|mcp(:.*)?|websearch|web_search|webfetch|web_fetch|fetch|generateimage|generate_image|askquestion|ask_question)$/i;
const SHELL_TOOLS = /^(shell|bash|terminal|run_terminal_cmd|runterminalcommand|run_terminal_command)$/i;
const WRITE_TOOLS = /(write|edit|delete|patch|replace|create|rename|move|notebook)/i;
const NOT_A_FILE_WRITE = /todo/i;
const PATH_KEY = /(path|file|dir|folder|target|cwd)/i;
const CONTENT_KEY = /(content|text|string|diff|patch|body|code|description|prompt)/i;

/** @param {unknown} v @param {string} key @param {string[]} out */
function collectPaths(v, key, out) {
  if (typeof v === 'string') {
    if (PATH_KEY.test(key) && !CONTENT_KEY.test(key)) out.push(v);
  } else if (Array.isArray(v)) {
    for (const x of v) collectPaths(x, key, out);
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) collectPaths(x, k, out);
  }
}

/** @param {string} toolName @param {unknown} toolInput @param {string | undefined} cwd @param {Ctx} ctx @returns {Decision} */
export function toolDecision(toolName, toolInput, cwd, ctx) {
  const name = String(toolName || '');
  if (DENIED_TOOLS.test(name) || name.toLowerCase().startsWith('mcp:')) return deny(`tool "${clip(name)}" is not available in this workspace`);
  const input = toolInput && typeof toolInput === 'object' ? /** @type {Record<string, unknown>} */ (toolInput) : {};
  const base = cwd || ctx.workspace;

  if (SHELL_TOOLS.test(name)) {
    const cmd = input.command ?? input.cmd;
    return shellDecision(typeof cmd === 'string' ? cmd : '', cwd, ctx);
  }

  /** @type {string[]} */
  const paths = [];
  collectPaths(input, '', paths);

  if (WRITE_TOOLS.test(name) && !NOT_A_FILE_WRITE.test(name)) {
    if (typeof toolInput === 'string') return deny('cannot determine which file the tool will change');
    if (paths.length === 0) return deny(`cannot determine which file "${clip(name)}" will change`);
    for (const p of paths) {
      const d = pathDecision(p, 'write', ctx, base);
      if (d.permission === 'deny') return d;
    }
    return ALLOW;
  }

  for (const p of paths) {
    const d = pathDecision(p, 'read', ctx, base);
    if (d.permission === 'deny') return d;
  }
  return ALLOW;
}

/**
 * @param {Record<string, any>} input hook stdin payload
 * @param {Ctx} ctx
 * @returns {Decision}
 */
export function decide(input, ctx) {
  const event = input?.hook_event_name;
  if (event === 'beforeShellExecution') return shellDecision(input.command, input.cwd, ctx);
  if (event === 'beforeReadFile') return pathDecision(input.file_path, 'read', ctx, ctx.workspace);
  if (event === 'preToolUse') return toolDecision(input.tool_name, input.tool_input, input.cwd, ctx);
  return ALLOW;
}
