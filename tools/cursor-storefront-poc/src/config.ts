import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDITABLE_PREFIXES } from '../hooks/guardPolicy.mjs';

export { EDITABLE_PREFIXES };

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATE_DIR = path.join(PACKAGE_ROOT, 'template');
export const GUARD_SCRIPT = path.join(PACKAGE_ROOT, 'hooks', 'guard.mjs');
export const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');

export const WORKSPACES_DIRNAME = '.cursor-storefront-workspaces';
export const DEFAULT_WORKSPACES_ROOT = path.join(REPO_ROOT, WORKSPACES_DIRNAME);
/** Written into a workspaces root so reset can refuse to delete anything else. */
export const ROOT_MARKER = '.speedvendors-workspaces-root';
export const STATE_FILE = 'state.json';

export const MODEL_ID = 'composer-2.5';

/** Local runtime built-ins removed from the agent's toolset (verified names in @cursor/sdk ToolName). */
export const DISALLOWED_TOOLS = ['task', 'mcp', 'webSearch', 'webFetch', 'generateImage', 'askQuestion'];

/** Top-level directories excluded from snapshots (rebuilt / vendored, too large to hash). */
export const SNAPSHOT_IGNORED_TOP_LEVEL = ['node_modules', 'dist'];
/** The one file inside node_modules we DO hash: npm rewrites it on any dependency change. */
export const NODE_MODULES_LOCK = 'node_modules/.package-lock.json';

export const DEFAULT_AGENT_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_BUILD_TIMEOUT_MS = 3 * 60 * 1000;
export const MAX_REPAIR_RUNS = 1;
export const MAX_PROMPT_CHARS = 4000;

export const LOCAL_RUNTIME_WARNING = [
  'This local PoC is for developer-controlled prompts only.',
  'It must not be exposed to real merchants.',
  'Production requires VM/container-level isolation or Cursor Cloud with a dedicated storefront repository.',
  '(The local Cursor sandbox restricts writes and network, but does NOT restrict reads outside the workspace.)',
].join('\n');

export const MIN_NODE = { major: 22, minor: 13 };
