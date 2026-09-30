import { useEffect, useRef, useState } from 'react';
import { Loader2, Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  buildCuratedPreviewSrcDoc,
  CURATED_PREVIEW_IFRAME_SANDBOX,
  type CuratedPreviewRuntimeOpts,
} from '@/lib/curated-themes/previewSrcDoc';
import {
  toRuntimeContentPayload,
  type StorefrontContentConfig,
} from '@/lib/curated-themes/storefrontContentConfig';
import type { CuratedThemeId } from '@/lib/curated-themes/themeIds';
import {
  isAllowedHostedCheckoutUrl,
  parseHostedCheckoutMessage,
} from '@/lib/curated-themes/hostedCheckoutHandoff';
import { toast } from 'sonner';

type Device = 'desktop' | 'mobile';

type Props = {
  themeId: CuratedThemeId;
  config: StorefrontContentConfig;
  runtime: CuratedPreviewRuntimeOpts | null;
  device: Device;
  onDeviceChange?: (d: Device) => void;
  className?: string;
  hideChrome?: boolean;
};

/**
 * Live curated-theme preview via packaged runtime + safe JSON injection.
 * Boots once per runtime key; subsequent content edits use postMessage (no remount).
 * Hosted checkout: iframe posts a validated URL; parent navigates top-level.
 */
export function CuratedThemePreviewFrame({
  themeId,
  config,
  runtime,
  device,
  onDeviceChange,
  className,
  hideChrome,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booted, setBooted] = useState(false);
  const configRef = useRef(config);
  configRef.current = config;
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const runtimeKey = runtime
    ? `${themeId}|${runtime.storeApiKey}|${runtime.apiBase}|${runtime.hostedCheckoutOrigin}|${runtime.returnOrigin}`
    : '';

  useEffect(() => {
    if (!runtime?.storeApiKey || !runtime.apiBase) {
      setSrcDoc(null);
      setBooted(false);
      setError('Store API key required for live preview.');
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setBooted(false);
    (async () => {
      try {
        const html = await buildCuratedPreviewSrcDoc({
          themeId,
          config: configRef.current,
          runtime,
          signal: ac.signal,
        });
        if (cancelled) return;
        setSrcDoc(html);
        setBooted(true);
      } catch (e) {
        if (cancelled) return;
        setSrcDoc(null);
        setBooted(false);
        setError(e instanceof Error ? e.message : 'Could not load curated preview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [runtimeKey, themeId, runtime]);

  useEffect(() => {
    if (!booted || !srcDoc) return;
    const payload = toRuntimeContentPayload(config);
    iframeRef.current?.contentWindow?.postMessage({ type: 'sv:set-content', payload }, '*');
  }, [config, booted, srcDoc]);

  // Trusted checkout handoff from sandboxed curated runtime iframe.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = parseHostedCheckoutMessage(event.data);
      if (!msg) return;
      const frame = iframeRef.current;
      if (!frame?.contentWindow || event.source !== frame.contentWindow) return;
      const cfg = runtimeRef.current;
      if (!cfg?.hostedCheckoutOrigin) return;
      if (!isAllowedHostedCheckoutUrl(msg.checkoutUrl, cfg.hostedCheckoutOrigin)) {
        toast.error('Checkout URL was rejected (origin/path not allowed).');
        return;
      }
      // Top-level navigation — sandbox blocks iframe top-nav by design.
      window.location.assign(msg.checkoutUrl);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <div className={className}>
      {!hideChrome ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#6E3DFF]/80">
            Live preview
            {loading ? ' · loading…' : ''}
          </p>
          {onDeviceChange ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={device === 'desktop' ? 'default' : 'ghost'}
                className="h-8"
                onClick={() => onDeviceChange('desktop')}
                aria-label="Desktop preview"
              >
                <Monitor className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={device === 'mobile' ? 'default' : 'ghost'}
                className="h-8"
                onClick={() => onDeviceChange('mobile')}
                aria-label="Mobile preview"
              >
                <Smartphone className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={`mx-auto overflow-hidden rounded-xl border bg-[#fbfaf8] shadow-sm transition-all ${
          device === 'mobile' ? 'h-[640px] w-[390px] max-w-full' : 'h-[640px] w-full'
        }`}
      >
        {srcDoc ? (
          <iframe
            ref={iframeRef}
            title={`${themeId} storefront preview`}
            srcDoc={srcDoc}
            sandbox={CURATED_PREVIEW_IFRAME_SANDBOX}
            className="h-full w-full bg-[#fbfaf8]"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
            {loading ? <Loader2 className="h-5 w-5 animate-spin text-[#6E3DFF]" /> : null}
            <p>{error || 'Preparing preview…'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
