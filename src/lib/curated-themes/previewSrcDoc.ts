/**
 * Build srcdoc HTML for curated-theme preview from the packaged runtime artifact.
 * Injects only safe JSON (__SV_RUNTIME__ / __SV_CONTENT__ / __SV_THEME__) — never merchant HTML/scripts.
 */
import type { StorefrontContentConfig } from './storefrontContentConfig';
import { toRuntimeContentPayload } from './storefrontContentConfig';
import { NOVATEE_RUNTIME_BASE } from './novatee';
import { FOUNDATION_RUNTIME_BASE } from './foundation';
import type { CuratedThemeId } from './themeIds';

export type CuratedPreviewRuntimeOpts = {
  storeApiKey: string;
  apiBase: string;
  hostedCheckoutOrigin: string;
  /** Parent app origin for return_origin (srcdoc has opaque/"null" origin). */
  returnOrigin: string;
};

const RUNTIME_BASE: Record<CuratedThemeId, string> = {
  novatee: NOVATEE_RUNTIME_BASE,
  foundation: FOUNDATION_RUNTIME_BASE,
};

/** Sandbox for merchant curated preview (trusted SpeedVendors runtime, not AI HTML). */
export const CURATED_PREVIEW_IFRAME_SANDBOX =
  'allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox' as const;

function runtimeBaseFor(themeId: CuratedThemeId): string {
  return RUNTIME_BASE[themeId] || NOVATEE_RUNTIME_BASE;
}

/** Absolute asset base for rewriting /assets and /themes paths inside the runtime HTML. */
export function curatedRuntimeOriginBase(themeId: CuratedThemeId, origin = window.location.origin): string {
  return `${origin}${runtimeBaseFor(themeId)}`;
}

/**
 * Fetch packaged index.html and inject runtime + content boot scripts.
 * Asset hrefs are rewritten to absolute curated-runtime URLs so srcdoc can load them.
 */
export async function buildCuratedPreviewSrcDoc(opts: {
  themeId: CuratedThemeId;
  config: StorefrontContentConfig;
  runtime: CuratedPreviewRuntimeOpts;
  signal?: AbortSignal;
}): Promise<string> {
  const base = curatedRuntimeOriginBase(opts.themeId);
  const indexUrl = `${base}/index.html?_=${Date.now()}`;
  const res = await fetch(indexUrl, { credentials: 'omit', signal: opts.signal });
  if (!res.ok) {
    throw new Error(
      `Curated runtime missing at ${runtimeBaseFor(opts.themeId)} (HTTP ${res.status}). Run: npm run sync:curated-runtime`,
    );
  }
  let html = await res.text();
  if (!html.includes('<html') && !html.includes('<!DOCTYPE') && !html.includes('<!doctype')) {
    throw new Error('invalid_curated_runtime_html');
  }

  // Rewrite root-absolute asset paths for srcdoc (opaque document has no path base).
  html = html
    .replace(/(href|src)=["']\/assets\//g, `$1="${base}/assets/`)
    .replace(/(href|src)=["']\.\/assets\//g, `$1="${base}/assets/`)
    .replace(/(href|src)=["']\/themes\//g, `$1="${base}/themes/`)
    .replace(/(href|src)=["']\.\/themes\//g, `$1="${base}/themes/`)
    .replace(/(href|src)=["']\/favicon/g, `$1="${base}/favicon`)
    .replace(/(href|src)=["']\.\/favicon/g, `$1="${base}/favicon`);

  const contentPayload = toRuntimeContentPayload(opts.config);
  const runtimePayload = {
    storeApiKey: opts.runtime.storeApiKey,
    apiBase: opts.runtime.apiBase,
    hostedCheckoutOrigin: opts.runtime.hostedCheckoutOrigin,
    returnOrigin: opts.runtime.returnOrigin,
    useEmbeddedCodCheckout: false,
  };

  // JSON.stringify is safe for script text content (no HTML injection from merchant fields —
  // fields were already sanitized; stringify escapes <, >, &, etc. in strings).
  const boot = `<script>window.__SV_THEME__=${JSON.stringify(opts.themeId)};window.__SV_RUNTIME__=${JSON.stringify(
    runtimePayload,
  )};window.__SV_CONTENT__=${JSON.stringify(contentPayload)};</script>`;

  if (html.includes('</head>')) {
    html = html.replace('</head>', `${boot}</head>`);
  } else {
    html = boot + html;
  }
  return html;
}
