import { useEffect, useMemo, type CSSProperties } from 'react';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import type { BrandDesignSystem } from '@/lib/ai-studio/v2/designSpec';
import { brandTokensToCssVars } from '@/lib/ai-studio/v2/tokens';
import { useIsMobile } from '@/hooks/use-mobile';
import { resolveResponsiveVariant, type SiteDocument, type SiteNode } from '@/lib/ai-studio/v2/siteTree';
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

/**
 * Applies a node's `responsive.mobile` override (variant swap, hide, spacing, minHeight)
 * on top of its base fields when the viewport is mobile. Was schema-defined and even
 * SiteOps-patchable but never actually read anywhere — this is the read side of that.
 * Returns the SAME node reference when nothing applies, so desktop rendering is untouched.
 */
function withResponsiveOverride(node: SiteNode, isMobile: boolean): SiteNode {
  const mobile = node.responsive?.mobile;
  if (!isMobile || !mobile) return node;
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

export default function SiteTreeRenderer({ document, brand, commerce, onAssetPlan }: Props) {
  const language = document.meta.language;
  const style = brandTokensToCssVars(brand) as CSSProperties;
  const isMobile = useIsMobile();
  const nodes = useMemo(
    () => document.pages.home.nodes.map((n) => withResponsiveOverride(n, isMobile)),
    [document.pages.home.nodes, isMobile]
  );

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
