/**
 * Dev preview for Cursor AI Store Builder versions (Phase 2).
 * Route: /dev/cursor-preview?version_id=
 *
 * Gated by VITE_AI_STORE_BUILDER_CURSOR or superadmin. Auth required.
 * Does NOT publish or set active_template.
 *
 * Iframe uses a short-lived HMAC preview token (query param) because browsers
 * cannot set Authorization on iframe navigations.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isAiStoreBuilderCursorEnabled } from '@/lib/ai-store-builder/featureFlag';

type VersionRow = {
  id: string;
  version_number: number;
  parent_version_id: string | null;
  status: string;
  build_status: string | null;
  prompt: string | null;
  model: string | null;
  manifest: Record<string, unknown> | null;
  preview_path: string | null;
  storage_path: string | null;
  content_sha256: string | null;
  content_size_bytes: number | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type PreviewToken = {
  token?: string | null;
  preview_url?: string | null;
  signed_url?: string | null;
  expires_in?: number;
  note?: string;
  manifest?: Record<string, unknown>;
  status?: string;
  build_status?: string | null;
};

export default function CursorStorefrontPreview() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const versionId = params.get('version_id') || '';

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [version, setVersion] = useState<VersionRow | null>(null);
  const [token, setToken] = useState<PreviewToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      if (isAiStoreBuilderCursorEnabled()) {
        if (!cancelled) setAllowed(true);
        return;
      }
      const { data: isSuper } = await supabase.rpc('is_superadmin_user');
      if (!cancelled) setAllowed(!!isSuper);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!allowed || !user || !versionId) return;
    let cancelled = false;
    setBusy(true);
    setError(null);

    (async () => {
      let row: VersionRow | null = null;
      let preview: PreviewToken | null = null;

      const { data: gw, error: gwErr } = await supabase.functions.invoke(
        'cursor-storefront-gateway',
        {
          body: { action: 'get_version', version_id: versionId },
        },
      );
      if (!gwErr && gw?.version) {
        row = gw.version as VersionRow;
      }

      const { data: tok } = await supabase.functions.invoke('cursor-storefront-gateway', {
        body: {
          action: 'get_preview_token',
          version_id: versionId,
          ttl_seconds: 300,
        },
      });
      if (tok && !tok.error) {
        preview = tok as PreviewToken;
      }

      if (!row) {
        const { data, error: selErr } = await supabase
          .from('cursor_storefront_versions')
          .select(
            'id, version_number, parent_version_id, status, build_status, prompt, model, manifest, preview_path, storage_path, content_sha256, content_size_bytes, created_at, metadata',
          )
          .eq('id', versionId)
          .maybeSingle();
        if (selErr) {
          if (!cancelled) setError(selErr.message);
        } else {
          row = data as VersionRow | null;
        }
      }

      if (!cancelled) {
        setVersion(row);
        setToken(preview);
        if (!row) setError((e) => e || 'Version not found');
        setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allowed, user, versionId]);

  if (authLoading || allowed === null) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (!allowed) {
    return (
      <div style={{ padding: 24, maxWidth: 560 }}>
        <h1>Cursor storefront preview</h1>
        <p>This route requires VITE_AI_STORE_BUILDER_CURSOR or superadmin access.</p>
        <Link to="/">Back</Link>
      </div>
    );
  }

  if (!versionId) {
    return (
      <div style={{ padding: 24, maxWidth: 640 }}>
        <h1>Cursor storefront preview</h1>
        <p>
          Provide <code>?version_id=</code> in the URL.
        </p>
        <Link to="/">Back</Link>
      </div>
    );
  }

  const iframeSrc = token?.preview_url || null;
  const ready =
    version?.status === 'stored' &&
    version?.build_status === 'ready' &&
    typeof iframeSrc === 'string' &&
    iframeSrc.length > 0;

  return (
    <div style={{ padding: 24, maxWidth: 960, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginTop: 0 }}>Cursor storefront preview</h1>
      <p style={{ color: '#555' }}>
        Phase 2 draft only — not published. Does not change <code>active_template</code>.
      </p>

      {busy && <p>Loading version…</p>}
      {error && (
        <p role="alert" style={{ color: '#b00020' }}>
          {error}
        </p>
      )}

      {version && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 18 }}>Version metadata</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '6px 12px' }}>
            <dt>ID</dt>
            <dd>
              <code>{version.id}</code>
            </dd>
            <dt>Number</dt>
            <dd>{version.version_number}</dd>
            <dt>Status</dt>
            <dd>
              {version.status} / {version.build_status || '—'}
            </dd>
            <dt>Parent</dt>
            <dd>{version.parent_version_id || '—'}</dd>
            <dt>SHA-256</dt>
            <dd>
              <code>{version.content_sha256 || '—'}</code>
            </dd>
            <dt>Size</dt>
            <dd>{version.content_size_bytes ?? '—'} bytes</dd>
            <dt>Model</dt>
            <dd>{version.model || '—'}</dd>
            <dt>Created</dt>
            <dd>{version.created_at}</dd>
          </dl>
          {version.prompt && (
            <>
              <h3 style={{ fontSize: 15 }}>Prompt</h3>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  background: '#f6f6f6',
                  padding: 12,
                  borderRadius: 6,
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                {version.prompt}
              </pre>
            </>
          )}
          {version.manifest && (
            <>
              <h3 style={{ fontSize: 15 }}>Manifest</h3>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  background: '#f6f6f6',
                  padding: 12,
                  borderRadius: 6,
                  maxHeight: 240,
                  overflow: 'auto',
                  fontSize: 12,
                }}
              >
                {JSON.stringify(version.manifest, null, 2)}
              </pre>
            </>
          )}
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Storefront preview</h2>
        {ready ? (
          <>
            <iframe
              title="Storefront artifact"
              src={iframeSrc!}
              style={{ width: '100%', height: 560, border: '1px solid #ddd', borderRadius: 6 }}
            />
            <p style={{ color: '#666', fontSize: 13 }}>
              Preview token expires in ~{token?.expires_in || 300}s. Refresh this page to mint a new
              one.
            </p>
            {token?.signed_url && (
              <p>
                <a href={token.signed_url} target="_blank" rel="noreferrer">
                  Download archive
                </a>
              </p>
            )}
          </>
        ) : (
          <div style={{ background: '#f9f9f9', padding: 16, borderRadius: 6 }}>
            <p style={{ marginTop: 0 }}>
              {token?.note ||
                'Version is not ready for iframe preview (need status=stored and build_status=ready with a packaged storefront-build.tar.gz).'}
            </p>
            <ol>
              <li>
                Agent must finish with <code>npm run build:artifact</code> so Cloud Artifacts include{' '}
                <code>storefront-build.tar.gz</code>.
              </li>
              <li>
                <code>complete_run</code> validates the archive, extracts to <code>site/</code>, then
                sets the draft pointer.
              </li>
              <li>Do not publish or set <code>active_template</code> from this preview.</li>
            </ol>
          </div>
        )}
      </section>

      <p style={{ marginTop: 32 }}>
        <Link to="/">Back home</Link>
      </p>
    </div>
  );
}
