import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildStorefront, minimalEnv } from './buildStorefront.ts';
import {
  DEFAULT_AGENT_TIMEOUT_MS,
  DEFAULT_WORKSPACES_ROOT,
  LOCAL_RUNTIME_WARNING,
  MIN_NODE,
  MODEL_ID,
  TEMPLATE_DIR,
} from './config.ts';
import { createWorkspace, readState, resetWorkspace, resolveWorkspacePaths } from './createWorkspace.ts';
import { runPipeline } from './pipeline.ts';
import { SafetyError } from './protectedFiles.ts';
import { formatReport } from './report.ts';
import { MissingApiKeyError, cursorDriver, type AgentDriver } from './runAgent.ts';
import { sanitizeText } from './sanitize.ts';

const USAGE = `SpeedVendors Cursor storefront PoC (developer-only)

Usage: npm run <script> -- [options]

  npm run generate -- --merchant <slug> --prompt "<design request>" [--timeout-min 10] [--dry-run] [--json]
  npm run followup -- --merchant <slug> --prompt "<change request>"   [--timeout-min 10] [--json]
  npm run build:workspace -- --merchant <slug>
  npm run preview  -- --merchant <slug> [--port 4173]
  npm run reset    -- --merchant <slug> --yes
  npm run doctor

Options
  --merchant     strict slug: a-z, 0-9, single hyphens (max 40)
  --dry-run      create the workspace and run every check + the build, but make NO Cursor call
  --root <dir>   workspaces root (default: <repo>/.cursor-storefront-workspaces)

CURSOR_API_KEY must be exported in the environment for live runs. It is never read from a file.
`;

function assertNode(): void {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  if (major < MIN_NODE.major || (major === MIN_NODE.major && minor < MIN_NODE.minor)) {
    throw new SafetyError(`Node ${MIN_NODE.major}.${MIN_NODE.minor}+ required (found ${process.versions.node})`);
  }
}

const dryRunDriver: AgentDriver = async (input) => {
  input.log(`DRY RUN — no Cursor call. Would run model ${MODEL_ID} with cwd=<workspace>, sandbox on, autoReview on, hooks from <workspace>/.cursor/hooks.json`);
  input.log(`prompt is ${input.prompt.length} chars`);
  return {
    agentId: null,
    runId: null,
    status: 'finished',
    model: MODEL_ID,
    durationMs: 0,
    usage: null,
    cost: null,
    costPending: false,
    agentUsageTotal: null,
  };
};

async function main(): Promise<number> {
  assertNode();
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    allowPositionals: false,
    options: {
      merchant: { type: 'string' },
      prompt: { type: 'string' },
      root: { type: 'string' },
      port: { type: 'string' },
      'timeout-min': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
    },
  });
  const root = values.root ? path.resolve(values.root) : DEFAULT_WORKSPACES_ROOT;
  const say = (s: string) => process.stderr.write(`${s}\n`);

  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(USAGE);
    return command ? 0 : 2;
  }

  if (command === 'doctor') {
    const key = process.env.CURSOR_API_KEY ? 'set (value hidden)' : 'NOT set';
    let sdk = 'ok';
    try {
      await import('@cursor/sdk');
    } catch (e) {
      sdk = `import failed: ${(e as Error).message}`;
    }
    const tmpl = await fs.access(path.join(TEMPLATE_DIR, 'node_modules')).then(() => 'installed', () => 'missing — run: npm run setup');
    process.stdout.write(
      [`node            ${process.versions.node} (need >= ${MIN_NODE.major}.${MIN_NODE.minor})`, `@cursor/sdk     ${sdk}`, `CURSOR_API_KEY  ${key}`, `template deps   ${tmpl}`, `workspaces root ${root}`, '', LOCAL_RUNTIME_WARNING, ''].join('\n'),
    );
    return 0;
  }

  const merchant = values.merchant;
  if (!merchant) {
    say('--merchant is required');
    return 2;
  }

  switch (command) {
    case 'create': {
      const { paths } = await createWorkspace({ merchantId: merchant, root });
      process.stdout.write(`created ${paths.workspaceDir}\n`);
      return 0;
    }
    case 'generate':
    case 'followup': {
      if (!values.prompt) {
        say('--prompt is required');
        return 2;
      }
      const dry = values['dry-run'] === true;
      if (!dry && !process.env.CURSOR_API_KEY) throw new MissingApiKeyError();
      say(LOCAL_RUNTIME_WARNING);
      say('');
      const timeoutMin = values['timeout-min'] ? Number(values['timeout-min']) : DEFAULT_AGENT_TIMEOUT_MS / 60_000;
      if (!Number.isFinite(timeoutMin) || timeoutMin <= 0 || timeoutMin > 60) throw new SafetyError('--timeout-min must be between 0 and 60');
      const report = await runPipeline({
        merchantId: merchant,
        prompt: values.prompt,
        kind: command,
        driver: dry ? dryRunDriver : cursorDriver,
        root,
        agentTimeoutMs: Math.round(timeoutMin * 60_000),
        log: (l) => say(`· ${l}`),
      });
      process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatReport(report)}\n`);
      if (dry) say('\nDRY RUN: no Cursor call was made and no cost was incurred.');
      return report.status === 'succeeded' ? 0 : 1;
    }
    case 'build': {
      const paths = resolveWorkspacePaths(merchant, root);
      await readState(paths);
      const b = await buildStorefront(paths.workspaceDir);
      process.stdout.write(`${b.ok ? 'BUILD PASSED' : 'BUILD FAILED'} (${(b.durationMs / 1000).toFixed(1)}s)\n`);
      if (!b.ok) process.stdout.write(`${sanitizeText(b.output, { workspaceDir: paths.workspaceDir })}\n`);
      return b.ok ? 0 : 1;
    }
    case 'preview': {
      const paths = resolveWorkspacePaths(merchant, root);
      await readState(paths);
      const port = values.port ?? '4173';
      if (!/^\d{2,5}$/.test(port)) throw new SafetyError('--port must be numeric');
      say(`Local preview of ${paths.merchantId} → http://127.0.0.1:${port}  (Ctrl+C to stop)`);
      const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port], {
        cwd: paths.workspaceDir,
        env: { ...minimalEnv(), NODE_ENV: 'development' },
        stdio: 'inherit',
      });
      return await new Promise<number>((resolve) => child.on('close', (c) => resolve(c ?? 0)));
    }
    case 'reset': {
      if (!values.yes) {
        say(`Refusing to delete without --yes. This removes ONLY the disposable workspace for "${merchant}".`);
        return 2;
      }
      const removed = await resetWorkspace(merchant, root);
      process.stdout.write(`removed ${removed}\n`);
      return 0;
    }
    default:
      say(`unknown command: ${command}\n`);
      process.stdout.write(USAGE);
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${sanitizeText(msg, { maxChars: 1000 })}\n`);
    process.exit(err instanceof SafetyError || err instanceof MissingApiKeyError ? 2 : 1);
  },
);
