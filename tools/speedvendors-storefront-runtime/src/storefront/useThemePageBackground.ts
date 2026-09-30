import { useEffect, type RefObject } from 'react';

const DEFAULT_PAGE_BG = '#0b0b10';

/**
 * Apply the active theme's page background to the scrolling surface (html/body)
 * so iOS overscroll does not reveal another theme's colour.
 * Reads `--sv-page-bg` from the theme root; restores on unmount / theme change.
 */
export function useThemePageBackground(
  rootRef: RefObject<HTMLElement | null>,
  fallback: string = DEFAULT_PAGE_BG,
) {
  useEffect(() => {
    const root = rootRef.current;
    const fromToken = root
      ? getComputedStyle(root).getPropertyValue('--sv-page-bg').trim()
      : '';
    const bg = fromToken || fallback;
    const html = document.documentElement;
    const prevHtml = html.style.getPropertyValue('--sv-page-bg');
    const prevBody = document.body.style.background;
    html.style.setProperty('--sv-page-bg', bg);
    document.body.style.background = bg;
    return () => {
      if (prevHtml) html.style.setProperty('--sv-page-bg', prevHtml);
      else html.style.removeProperty('--sv-page-bg');
      document.body.style.background = prevBody;
    };
  }, [rootRef, fallback]);
}
