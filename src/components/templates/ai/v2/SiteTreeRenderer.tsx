import { useEffect, useMemo, type CSSProperties } from 'react';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import type { BrandDesignSystem } from '@/lib/ai-studio/v2/designSpec';
import { brandTokensToCssVars } from '@/lib/ai-studio/v2/tokens';
import { useIsCompactViewport } from './useCompactViewport';
import { withResponsiveOverride, resolveMobileOrder } from '@/lib/ai-studio/v2/responsiveOverride';
import type { SiteDocument } from '@/lib/ai-studio/v2/siteTree';
import {
  assetForNode,
  buildAssetPlan,
  type AssetCatalog,
  type AssetPlan,
} from '@/lib/ai-studio/v2/assetResolver';
import { resolveComposition } from './registry';
import './v2.css';

type Props = {
  document: SiteDocument;
  brand: BrandDesignSystem;
  commerce: StorefrontCommerce;
  /** DEV: receives the asset plan so the Generate Lab can show what resolved where. */
  onAssetPlan?: (plan: AssetPlan) => void;
};

export default function SiteTreeRenderer({ document, brand, commerce, onAssetPlan }: Props) {
  const language = document.meta.language;
  const style = brandTokensToCssVars(brand) as CSSProperties;
  const isCompact = useIsCompactViewport();
  const nodes = useMemo(() => {
    const overridden = document.pages.home.nodes.map((n) => withResponsiveOverride(n, isCompact));
    // Desktop path: preserve existing node order exactly — no placement resolver involved.
    if (!isCompact) return overridden;
    // Compact path only (Phase 6C): hidden nodes must be filtered out BEFORE the placement
    // resolver runs, so a placement anchored to a hidden node correctly falls back to the
    // mover's own desktop-relative position instead of being treated as a valid target that
    // merely doesn't render — see resolveMobileOrder's own doc comment.
    const visible = overridden.filter((n) => n.visible !== false);
    return resolveMobileOrder(visible);
  }, [document.pages.home.nodes, isCompact]);

  // One plan per document/catalog so single-image slots get distinct products
  // instead of every composition independently grabbing index 0.
  const assetPlan = useMemo(
    () => buildAssetPlan({ nodes, catalog: commerce as unknown as AssetCatalog }),
    [nodes, commerce]
  );

  useEffect(() => {
    onAssetPlan?.(assetPlan);
  }, [onAssetPlan, assetPlan]);

  return (
    <div
      className="ai-v2-root"
      style={style}
      data-density={brand.tokens.density}
      data-motion={brand.tokens.motion}
      data-radius={brand.tokens.radius}
      data-shadow={brand.tokens.shadow}
      data-button-style={brand.tokens.buttonStyle}
      data-type-scale={brand.tokens.typographyScale}
      data-type-role={brand.tokens.typographyRole}
    >
      {nodes.map((node) => {
        if (node.visible === false) return null;
        const entry = resolveComposition(node.type, node.variant);
        if (!entry) {
          console.warn('[ai-v2] unknown composition', node.type, node.variant);
          return null;
        }
        const Cmp = entry.Component;
        return (
          <Cmp
            key={node.id}
            node={node}
            brand={brand}
            commerce={commerce}
            language={language}
            asset={assetForNode(assetPlan, node.id)}
          />
        );
      })}
    </div>
  );
}
