// EDITABLE presentation entry — resolves an allowlisted theme and mounts it.
import { useEffect, useMemo, useState } from 'react';
import './shell.css';
import { resolveContentSlots, type ContentSlots } from './contentSlots';
import { readConfiguredThemeId, resolveTheme } from './themeRegistry';

/** Parent dashboard may push sanitized content for live curated-theme editing. */
const SV_CONTENT_MESSAGE = 'sv:set-content';

export default function StorefrontApp() {
  const [contentTick, setContentTick] = useState(0);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if ((data as { type?: string }).type !== SV_CONTENT_MESSAGE) return;
      const payload = (data as { payload?: unknown }).payload;
      if (!payload || typeof payload !== 'object') return;
      // Only accept plain JSON objects — never executable markup.
      (window as Window & { __SV_CONTENT__?: unknown }).__SV_CONTENT__ = payload;
      const tid = (payload as Record<string, unknown>).themeId;
      if (typeof tid === 'string') {
        (window as Window & { __SV_THEME__?: unknown }).__SV_THEME__ = tid;
      }
      setContentTick((n) => n + 1);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const theme = useMemo(
    () => resolveTheme(readConfiguredThemeId()),
    // contentTick re-reads allowlisted theme id after parent postMessage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentTick],
  );

  const content: ContentSlots = useMemo(
    () => resolveContentSlots(theme.defaultContent),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, contentTick, typeof window !== 'undefined' ? window.location.search : ''],
  );

  const Root = theme.Root;
  return <Root content={content} />;
}
