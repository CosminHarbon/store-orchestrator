import { spawn } from 'node:child_process';
import { DEFAULT_BUILD_TIMEOUT_MS } from './config.ts';
import { sanitizeText } from './sanitize.ts';

export interface BuildResult {
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  /** Sanitised, length-bounded output (safe to feed back to a repair prompt or print). */
  output: string;
}

/** Deliberately minimal environment: no API keys, tokens or cloud credentials reach the build. */
export function minimalEnv(): NodeJS.ProcessEnv {
  const keep = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SHELL', 'USER'];
  const env: NodeJS.ProcessEnv = { CI: '1', NODE_ENV: 'production', npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false' };
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  return env;
}

/** Independent build (run by the PoC, not by the agent): `npm run build` in the workspace. */
export function buildStorefront(workspaceDir: string, opts: { timeoutMs?: number } = {}): Promise<BuildResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS;
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn('npm', ['run', 'build'], { cwd: workspaceDir, env: minimalEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let timedOut = false;
    const collect = (d: Buffer) => {
      buf += d.toString('utf8');
      if (buf.length > 200_000) buf = buf.slice(-100_000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const finish = (exitCode: number | null, extra = '') => {
      clearTimeout(timer);
      resolve({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
        output: sanitizeText(`${buf}${extra}`, { workspaceDir }),
      });
    };
    child.on('error', (err) => finish(null, `\n[spawn error] ${err.message}`));
    child.on('close', (code) => finish(code));
  });
}
