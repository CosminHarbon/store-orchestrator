/**
 * Serve extracted storefront preview files from cursor-storefront-artifacts.
 *
 * GET ?version_id=&path=index.html&token=...
 * Auth: HMAC preview token (query) OR Authorization Bearer JWT (owner / superadmin).
 *
 * HTML responses rewrite ./assets/ and root-absolute site paths into the same
 * query-param URL shape so browsers can load JS/CSS (relative ./assets breaks
 * when the document URL is …/cursor-storefront-preview?…).
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import {
  CURSOR_ARTIFACTS_BUCKET,
  artifactStorageDir,
  sanitizePreviewRelPath,
} from '../_shared/cursorArtifactStore.ts';
import { verifyPreviewToken } from '../_shared/cursorPreviewToken.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function contentTypeForPath(p: string): string {
  const lower = p.toLowerCase();
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.map')) return 'application/json';
  return 'application/octet-stream';
}

async function isSuperadmin(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'superadmin')
    .maybeSingle();
  return Boolean(data);
}

/** Map packaged site-relative href/src onto preview query URLs (keeps auth token). */
function rewriteHtmlForQueryPreview(
  html: string,
  opts: {
    versionId: string;
    token: string;
    endpointPath: string;
    storeApiKey: string | null;
    apiBase: string | null;
  },
): string {
  const makeUrl = (rel: string) => {
    const clean = rel.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
    const q = new URLSearchParams({
      version_id: opts.versionId,
      path: clean,
    });
    if (opts.token) q.set('token', opts.token);
    return `${opts.endpointPath}?${q.toString()}`;
  };

  let out = html.replace(
    /\b(href|src)=["']([^"']+)["']/gi,
    (full, attr: string, raw: string) => {
      const v = raw.trim();
      if (!v || v.startsWith('data:') || v.startsWith('blob:') || v.startsWith('http://') ||
        v.startsWith('https://') || v.startsWith('//') || v.startsWith('#')) {
        return full;
      }
      // ./assets/…, assets/…, /favicon.svg, /assets/…
      if (
        v.startsWith('./') ||
        v.startsWith('assets/') ||
        v.startsWith('/assets/') ||
        v.startsWith('favicon') ||
        v.startsWith('/favicon')
      ) {
        return `${attr}="${makeUrl(v)}"`;
      }
      return full;
    },
  );

  // Inject merchant store-api key (public storefront key) so preview uses live commerce, not mocks.
  if (opts.storeApiKey && opts.apiBase && !out.includes('__SV_RUNTIME__')) {
    const payload = JSON.stringify({
      storeApiKey: opts.storeApiKey,
      apiBase: opts.apiBase,
    });
    const boot =
      `<script>window.__SV_RUNTIME__=${payload};</script>`;
    if (out.includes('</head>')) {
      out = out.replace('</head>', `${boot}</head>`);
    } else {
      out = boot + out;
    }
  }

  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const url = new URL(req.url);
  const versionId = url.searchParams.get('version_id') || '';
  const token = url.searchParams.get('token') || '';
  const rawPath = url.searchParams.get('path') || 'index.html';
  const safePath = sanitizePreviewRelPath(rawPath);

  if (!versionId) return json({ error: 'version_id_required' }, 400);
  if (!safePath) return json({ error: 'invalid_path' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !service || !anon) return json({ error: 'not_configured' }, 503);

  const admin = createClient(supabaseUrl, service);

  let authUserId: string | null = null;

  if (token) {
    const claims = await verifyPreviewToken(token);
    if (!claims || claims.versionId !== versionId) {
      return json({ error: 'invalid_token' }, 401);
    }
    authUserId = claims.userId;
  } else {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
    authUserId = userData.user.id;
  }

  const { data: version, error: vErr } = await admin
    .from('cursor_storefront_versions')
    .select('id, user_id, status, build_status, storage_path, session_id')
    .eq('id', versionId)
    .maybeSingle();

  if (vErr || !version) return json({ error: 'not_found' }, 404);

  const ownerOk = version.user_id === authUserId;
  const superOk = authUserId ? await isSuperadmin(admin, authUserId) : false;
  if (!ownerOk && !superOk) return json({ error: 'forbidden' }, 403);

  if (version.status !== 'stored' || version.build_status !== 'ready') {
    return json({ error: 'not_ready', status: version.status, build_status: version.build_status }, 409);
  }

  const dir = artifactStorageDir({
    userId: version.user_id,
    sessionId: version.session_id,
    versionId: version.id,
  });
  const objectPath = `${dir}/site/${safePath}`;

  const { data: blob, error: dlErr } = await admin.storage
    .from(CURSOR_ARTIFACTS_BUCKET)
    .download(objectPath);

  if (dlErr || !blob) {
    return json({ error: 'object_not_found', path: safePath }, 404);
  }

  const headers: Record<string, string> = {
    ...cors,
    'Content-Type': contentTypeForPath(safePath),
    'Cache-Control': 'private, max-age=60',
    'X-SV-Preview': 'phase3-v13',
  };
  // Supabase edge currently rewrites HTML GET bodies to Content-Type: text/plain.
  // Keep nosniff for non-HTML; omit it for HTML so browsers can still render the document.
  if (!safePath.toLowerCase().endsWith('.html')) {
    headers['X-Content-Type-Options'] = 'nosniff';
  }

  if (req.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  if (safePath.toLowerCase().endsWith('.html')) {
    const html = await blob.text();
    const { data: profile } = await admin
      .from('profiles')
      .select('store_api_key')
      .eq('user_id', version.user_id)
      .maybeSingle();
    const storeApiKey = profile?.store_api_key ? String(profile.store_api_key) : null;
    const apiBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/store-api`;
    const endpointPath = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/cursor-storefront-preview`;
    const rewritten = rewriteHtmlForQueryPreview(html, {
      versionId,
      token,
      endpointPath,
      storeApiKey,
      apiBase,
    });
    const body = new Blob([rewritten], { type: 'text/html; charset=utf-8' });
    return new Response(body, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }

  return new Response(blob.stream(), { status: 200, headers });
});
