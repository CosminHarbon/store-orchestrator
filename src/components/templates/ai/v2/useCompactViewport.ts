import { useEffect, useState } from 'react';

/**
 * Phase 6A — V2's own "compact viewport" concept, deliberately separate from the shared
 * app-wide `useIsMobile()` (src/hooks/use-mobile.tsx, 768px), which drives unrelated
 * dashboard chrome (sidebar, comboboxes, locker picker) and must not change.
 *
 * `responsive.mobile` means "the range where the V2 storefront's own CSS already collapses
 * to its compact layout" (nav links hidden, grids to 1 column, hero image reordered — see
 * v2.css's primary `@media (max-width: 960px)` block), not literally phone-width. Below
 * 960px was previously silently inconsistent: CSS already looked compact from 769px down,
 * but `responsive.mobile.*` overrides only activated below 768px (the shared hook's
 * threshold) — a node authored to `hide`/swap variant/etc. on mobile would not do so in the
 * 769–959px band despite everything around it already rendering compact. This constant is
 * the fix: one threshold, used consistently for both CSS (already 960px) and the runtime
 * override path.
 */
export const V2_COMPACT_BREAKPOINT = 960;

/** Pure and DOM-free — testable without a browser or matchMedia. */
export function isCompactViewportWidth(width: number): boolean {
  return width <= V2_COMPACT_BREAKPOINT;
}

function compactMediaQuery(): string {
  return `(max-width: ${V2_COMPACT_BREAKPOINT}px)`;
}

/**
 * React hook wrapper around `isCompactViewportWidth`. Starts `false` (matches the existing
 * `useIsMobile()` initial-render behavior: SiteTreeRenderer already renders once before this
 * resolves, then re-renders on the effect — no new SSR/initial-render assumption introduced).
 */
export function useIsCompactViewport(): boolean {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(compactMediaQuery());
    const onChange = () => setIsCompact(isCompactViewportWidth(window.innerWidth));
    mql.addEventListener('change', onChange);
    setIsCompact(isCompactViewportWidth(window.innerWidth));
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isCompact;
}
