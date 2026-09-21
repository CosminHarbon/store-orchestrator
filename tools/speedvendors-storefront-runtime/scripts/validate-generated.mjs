#!/usr/bin/env node
/**
 * Validate generated / editable storefront surface before packaging.
 *
 * - Scans src/storefront for forbidden commerce/payment patterns
 * - Fails if leftover editable trees exist outside storefront (components/, styles/)
 * - Fails if unexpected source files appear under src/ outside storefront + speedvendors + main
 *
 * Export: validateGenerated(root) → { ok: true } | throws / process.exit
 *
 * Run: node scripts/validate-generated.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '..');

const FORBIDDEN_PATTERNS = [
  { name: 'stripe', re: /\bstripe\b/i },
  { name: 'netopia', re: /\bnetopia\b/i },
  { name: 'supabase', re: /\bsupabase\b/i },
  { name: 'service_role', re: /service[_-]?role/i },
  { name: '/orders', re: /\/orders\b/ },
  { name: 'payment_method', re: /payment_method/i },
  { name: 'createClient', re: /\bcreateClient\b/ },
  {
    name: 'payment_host_fetch',
    re: /fetch\s*\(\s*['"`]https?:\/\/[^'"`]*(stripe|netopia|paypal|braintree|adyen)/i,
  },
  {
    name: 'fake_product_id',
    re: /\b(product[_-]?\d+|demo[_-]product|sample[_-]sku|test[_-]product|lorem[_-]ipsum)\b/i,
  },
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Extract string literals from ids={[...]} / ids: [...] style product ID lists. */
function extractIdLiterals(text) {
  /** @type {string[]} */
  const out = [];
  const re = /\bids\s*[:=]\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(text))) {
    const inner = m[1] || '';
    for (const lit of inner.matchAll(/['"`]([^'"`]+)['"`]/g)) {
      out.push(lit[1]);
    }
  }
  return out;
}

const ALLOWED_SRC_TOP = new Set(['storefront', 'speedvendors', 'main.tsx']);

function walkFiles(dir, base = dir) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === 'node_modules' || name.name === 'dist') continue;
      out.push(...walkFiles(abs, base));
    } else if (name.isFile()) {
      out.push(path.relative(base, abs).split(path.sep).join('/'));
    }
  }
  return out;
}

/**
 * @param {string} root
 * @returns {{ ok: true, scanned: number }}
 */
export function validateGenerated(root = DEFAULT_ROOT) {
  const errors = [];

  // Leftover editable trees that agents used to touch — must not exist.
  for (const banned of ['src/components', 'src/styles']) {
    const abs = path.join(root, banned);
    if (existsSync(abs)) {
      errors.push(`forbidden leftover path exists: ${banned} (move UI into src/speedvendors/ui or src/storefront)`);
    }
  }

  // src/ top-level must only be storefront + speedvendors + main.tsx
  const srcDir = path.join(root, 'src');
  if (existsSync(srcDir)) {
    for (const name of readdirSync(srcDir)) {
      if (!ALLOWED_SRC_TOP.has(name)) {
        errors.push(`unexpected src entry outside editable/protected surface: src/${name}`);
      }
    }
  }

  const storefrontDir = path.join(root, 'src/storefront');
  const files = walkFiles(storefrontDir);
  for (const rel of files) {
    if (!/\.(tsx?|jsx?|css|md)$/i.test(rel)) continue;
    const abs = path.join(storefrontDir, rel);
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    for (const { name, re } of FORBIDDEN_PATTERNS) {
      if (re.test(text)) {
        errors.push(`forbidden pattern "${name}" in src/storefront/${rel}`);
      }
    }
    for (const id of extractIdLiterals(text)) {
      if (!UUID_RE.test(id)) {
        errors.push(`invalid product id "${id}" in src/storefront/${rel} (must be real UUID)`);
      }
    }
  }

  // Protected tree must exist
  const protectedUi = path.join(root, 'src/speedvendors/ui');
  if (!existsSync(protectedUi) || !statSync(protectedUi).isDirectory()) {
    errors.push('missing protected UI: src/speedvendors/ui');
  }

  if (errors.length > 0) {
    const msg = `[validate-generated] failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`;
    const err = new Error(msg);
    /** @type {any} */ (err).validationErrors = errors;
    throw err;
  }

  return { ok: true, scanned: files.length };
}

function main() {
  try {
    const r = validateGenerated(DEFAULT_ROOT);
    console.log(`[validate-generated] ok scanned=${r.scanned} storefront files`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
