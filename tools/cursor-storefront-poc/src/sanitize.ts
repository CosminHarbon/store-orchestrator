import os from 'node:os';

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const SECRET_PATTERNS: RegExp[] = [
  /\bCURSOR_API_KEY\s*[=:]\s*\S+/gi,
  /\b(?:crsr|cursor|sk|pk|ghp|gho|github_pat|xox[bp]|AKIA)[_-][A-Za-z0-9_-]{16,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

/** Strip terminal codes, hide local paths, redact secret-shaped strings, bound the length. */
export function sanitizeText(text: string, opts: { workspaceDir?: string; maxChars?: number } = {}): string {
  let out = text.replace(ANSI, '');
  if (opts.workspaceDir) out = out.split(opts.workspaceDir).join('<workspace>');
  const home = os.homedir();
  if (home && home !== '/') out = out.split(home).join('~');
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[redacted]');
  const max = opts.maxChars ?? 6000;
  if (out.length > max) {
    const half = Math.floor(max / 2);
    out = `${out.slice(0, half)}\n… [truncated ${out.length - max} chars] …\n${out.slice(-half)}`;
  }
  return out.trim();
}

/** One-line, length-bounded, redacted summary for streaming status lines. */
export function oneLine(text: string, max = 110): string {
  const s = sanitizeText(text, { maxChars: 10_000 }).replace(/\s+/g, ' ');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
