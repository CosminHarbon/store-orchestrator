import { useEffect, useMemo, type CSSProperties } from 'react';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import type { BrandDesignSystem } from '@/lib/ai-studio/v2/designSpec';
import type { SiteDocument } from '@/lib/ai-studio/v2/siteTree';
import { brandTokensToCssVars } from '@/lib/ai-studio/v2/tokens';
import {
  GRAMMAR_STATUS,
  planForDocument,
  roleCssVars,
  type GrammarViewport,
  type LayoutGrammarId,
} from '@/lib/ai-studio/v2/layoutGrammar';
import type { CreativeStrategy } from '@shared/ai-studio-v2/creativeStrategy';
import {
  CinematicFullBleedPage,
  EditorialAsymmetricPage,
  ImmersiveCatalogPage,
  ProductMonumentPage,
  TypographicCampaignPage,
  WarmStorytellingPage,
} from './Grammars';
import './grammar.css';
import './grammar-5b2.css';

type Props = {
  document: SiteDocument;
  brand: BrandDesignSystem;
  commerce: StorefrontCommerce;
  grammarOverride: LayoutGrammarId;
  strategy?: CreativeStrategy | null;
  spec?: unknown;
  seed?: string | number;
  viewport?: GrammarViewport;
  onPlan?: (plan: ReturnType<typeof planForDocument>['plan']) => void;
};

const PAGES = {
  editorial_asymmetric: EditorialAsymmetricPage,
  cinematic_full_bleed: CinematicFullBleedPage,
  product_monument: ProductMonumentPage,
  typographic_campaign: TypographicCampaignPage,
  immersive_catalog: ImmersiveCatalogPage,
  warm_storytelling: WarmStorytellingPage,
} as const;

export default function GrammarRenderer({
  document,
  brand,
  commerce,
  grammarOverride,
  strategy,
  spec,
  seed = 'seed-a',
  viewport = 'desktop',
  onPlan,
}: Props) {
  const { plan, page } = useMemo(
    () =>
      planForDocument({
        document,
        catalog: {
          products: commerce.products,
          collections: commerce.collections,
          reviews: commerce.reviews,
        },
        strategy,
        spec,
        seed,
        grammarOverride,
        viewport,
      }),
    [document, commerce.products, commerce.collections, commerce.reviews, strategy, spec, seed, grammarOverride, viewport]
  );

  useEffect(() => {
    onPlan?.(plan);
  }, [onPlan, plan]);

  const brandVars = brandTokensToCssVars(brand) as CSSProperties;
  const { background: _bg, color: _color, fontFamily: _ff, ...tokenVars } = brandVars;
  const style = {
    ...tokenVars,
    ...roleCssVars(plan.typography),
  } as CSSProperties;

  const Page = PAGES[plan.grammarId];

  return (
    <div
      className="lg-root"
      style={style}
      data-grammar={plan.grammarId}
      data-status={GRAMMAR_STATUS[plan.grammarId]}
      data-viewport={viewport}
      data-hero={plan.heroGeometry}
      data-seed={plan.variation.seed}
      data-overlap={plan.variation.overlap}
      data-rhythm={plan.variation.rhythm}
      data-width={plan.variation.contentWidth}
      data-nav={plan.variation.nav}
      data-motion={brand.tokens.motion || 'none'}
    >
      <Page plan={plan} page={page} commerce={commerce} />
      {commerce.cartOpen ? (
        <div className="lg-cart-sheet" role="dialog" aria-label="Cart">
          <p className="lg-cart-sheet-title">Cart</p>
          <p className="lg-cart-sheet-count">{commerce.cartCount} item{commerce.cartCount === 1 ? '' : 's'}</p>
          <button type="button" className="lg-cta lg-cta-solid" onClick={() => commerce.setCartOpen(false)}>
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function grammarFontFamilies(grammarId: LayoutGrammarId): string[] {
  const map: Record<LayoutGrammarId, string[]> = {
    editorial_asymmetric: ['Cormorant Garamond', 'Manrope'],
    cinematic_full_bleed: ['Outfit', 'DM Sans'],
    product_monument: ['Fraunces', 'DM Sans'],
    typographic_campaign: ['Space Grotesk', 'DM Sans'],
    immersive_catalog: ['DM Sans', 'DM Sans'],
    warm_storytelling: ['Fraunces', 'Source Serif 4'],
  };
  return map[grammarId];
}
