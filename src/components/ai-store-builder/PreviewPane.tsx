import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DeviceMode } from '@/hooks/useCursorAiStoreBuilder';
import {
  CURSOR_PREVIEW_IFRAME_SANDBOX,
  injectPreviewIsolationProbe,
} from '@/lib/ai-store-builder/previewSandbox';

type Props = {
  previewUrl: string | null;
  device: DeviceMode;
  busy?: boolean;
  viewingOlder?: boolean;
  onRefresh?: () => void;
  onRestoreViewed?: () => void;
  onBackToCurrent?: () => void;
  hidden?: boolean;
  /** Dev/QA: inject parent-isolation probe into srcdoc (never enable for production merchants). */
  injectIsolationProbe?: boolean;
};

const WIDTH: Record<DeviceMode, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

/**
 * Phase 3 preview transport: fetch HTML then render via iframe srcdoc.
 *
 * Why srcdoc: Supabase Edge currently forces preview HTML GET responses to a
 * Content-Type unsuitable for direct iframe navigation (text/plain + nosniff).
 * This is a temporary transport workaround — Phase 4 hosting must serve
 * storefronts as text/html from a proper dedicated origin (not dashboard srcdoc).
 *
 * Security: sandbox is `allow-scripts allow-forms` only — NO allow-same-origin,
 * so AI-generated code runs in an opaque unique origin and cannot read dashboard
 * DOM/storage/auth even if it tries window.parent.*.
 */
export default function PreviewPane({
  previewUrl,
  device,
  busy,
  viewingOlder,
  onRefresh,
  onRestoreViewed,
  onBackToCurrent,
  hidden,
  injectIsolationProbe = false,
}: Props) {
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(false);

  useEffect(() => {
    if (!previewUrl) {
      setSrcDoc(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoadingHtml(true);
    setLoadError(null);
    (async () => {
      try {
        const res = await fetch(previewUrl, { credentials: 'omit', mode: 'cors' });
        if (!res.ok) throw new Error(`preview_${res.status}`);
        let html = await res.text();
        if (cancelled) return;
        if (!html.includes('<html') && !html.includes('<!doctype')) {
          throw new Error('invalid_preview_html');
        }
        if (injectIsolationProbe) {
          html = injectPreviewIsolationProbe(html);
        }
        setSrcDoc(html);
      } catch {
        if (!cancelled) {
          setSrcDoc(null);
          setLoadError('Could not load preview.');
        }
      } finally {
        if (!cancelled) setLoadingHtml(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewUrl, injectIsolationProbe]);

  return (
    <section className="sv-cursor-builder__preview" data-hidden={hidden ? 'true' : undefined}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#6E3DFF]/80">
          Store preview
          {busy ? ' · updating…' : ''}
        </p>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onRefresh}
            disabled={!previewUrl}
            aria-label="Refresh preview"
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
        )}
      </div>

      {viewingOlder && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-medium">Viewing an older version</span>
          {onRestoreViewed && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRestoreViewed}>
              Restore this version
            </Button>
          )}
          {onBackToCurrent && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onBackToCurrent}>
              Back to current
            </Button>
          )}
        </div>
      )}

      <div className="sv-cursor-builder__frame-wrap">
        <div className="sv-cursor-builder__frame" style={{ maxWidth: WIDTH[device] }}>
          {srcDoc ? (
            <iframe
              title="AI storefront preview"
              srcDoc={srcDoc}
              sandbox={CURSOR_PREVIEW_IFRAME_SANDBOX}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {loadError
                ? loadError
                : loadingHtml || busy
                  ? 'Your storefront is being created…'
                  : 'Preview will appear here once your draft is ready.'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
