import { resolveResponsiveVariant, type SiteNode } from './siteTree';

/**
 * Applies a node's `responsive.mobile` override (variant swap, hide, spacing, minHeight)
 * on top of its base fields when the viewport is V2-compact (see
 * src/components/templates/ai/v2/useCompactViewport.ts — NOT the shared app-wide
 * useIsMobile()/768px, which drives unrelated dashboard chrome). Was schema-defined and
 * even SiteOps-patchable but never actually read anywhere — this is the read side of that.
 * Returns the SAME node reference when nothing applies, so desktop rendering is untouched.
 *
 * `contentOrder`/`columns` are deliberately NOT part of this function: per Phase 6A's
 * rendering contract they're read directly off `node.responsive.mobile` by the individual
 * composition components (compositions.tsx) and emitted as static data attributes whose
 * visual effect is gated by CSS media queries alone, not by this JS override path — so they
 * survive through here unchanged on whichever node object is returned (this function never
 * touches `.responsive`, only `.visible`/`.variant`/`.design`).
 *
 * Lives in its own CSS-free module (not inline in SiteTreeRenderer.tsx, which imports
 * v2.css) specifically so Phase 6A's selftest can import and exercise this exact function
 * directly under plain Node/tsx, without a DOM/React render or a CSS-loader — closing the
 * "zero direct test coverage" gap the Phase 6.1 audit found here.
 */
export function withResponsiveOverride(node: SiteNode, isCompact: boolean): SiteNode {
  const mobile = node.responsive?.mobile;
  if (!isCompact || !mobile) return node;
  if (mobile.hide) return { ...node, visible: false };
  if (!mobile.variant && !mobile.spacing && !mobile.minHeight) return node;
  return {
    ...node,
    variant: resolveResponsiveVariant(node.type, node.variant, mobile.variant),
    design: {
      ...node.design,
      spacing: mobile.spacing || node.design?.spacing,
      minHeight: mobile.minHeight || node.design?.minHeight,
    },
  };
}

/**
 * Phase 6A — pure, DOM-free helpers turning `node.responsive.mobile.contentOrder`/`columns`
 * into the data attributes the compact-viewport CSS keys off (v2.css). Moved here (Phase
 * 6A.1) from compositions.tsx, which must only export React components — a non-component
 * export there breaks react-refresh/only-export-components. This module is the correct home:
 * it already holds the sibling pure responsive helper (withResponsiveOverride) and has no
 * React/CSS dependency, so both are importable directly from a plain Node/tsx test.
 *
 * `contentOrder`/`columns` are NOT part of `withResponsiveOverride` above: they're read
 * directly off the node by the individual composition components (compositions.tsx) and
 * emitted as static data attributes whose visual effect is gated by CSS media queries alone,
 * not by the JS override path — so they survive through withResponsiveOverride unchanged on
 * whichever node object it returns (that function never touches `.responsive`).
 */
export function mobileOrderAttr(node: SiteNode): string | undefined {
  const value = node.responsive?.mobile?.contentOrder;
  return value && value !== 'preserve' ? value : undefined;
}

export function mobileColumnsAttr(node: SiteNode): string | undefined {
  const value = node.responsive?.mobile?.columns;
  return value ? String(value) : undefined;
}
