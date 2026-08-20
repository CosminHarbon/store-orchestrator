import type {
  DensityOption,
  HeroVariant,
  HomeSection,
  LayoutId,
  NavVariant,
  ProductCardVariant,
  SectionType,
  StorefrontCopy,
  StorefrontSpec,
  StorefrontTokens,
} from './spec';
import { LAYOUT_IDS } from './spec';

export const LAYOUT_LABELS: Record<LayoutId, { en: string; ro: string }> = {
  atelier: { en: 'Atelier', ro: 'Atelier' },
  editorial: { en: 'Editorial', ro: 'Editorial' },
  luxeDark: { en: 'Luxe Dark', ro: 'Luxe Dark' },
  minimal: { en: 'Minimal', ro: 'Minimal' },
  warmMarket: { en: 'Warm Market', ro: 'Piață caldă' },
};

export function isLayoutId(value: unknown): value is LayoutId {
  return typeof value === 'string' && (LAYOUT_IDS as readonly string[]).includes(value);
}

export function layoutLabel(layoutId: LayoutId | undefined, language: 'ro' | 'en' = 'en'): string {
  const id = isLayoutId(layoutId) ? layoutId : 'atelier';
  return LAYOUT_LABELS[id][language];
}

export function inferLayoutId(niche: string, mood: string, prompt = ''): LayoutId {
  const p = `${niche} ${mood} ${prompt}`.toLowerCase();
  if (/dark|luxe|luxury|gold|negru|lux\b/.test(p)) return 'luxeDark';
  if (/editorial|magazine|lookbook|marquee/.test(p)) return 'editorial';
  if (/floral|flower|florist|flori|floare|blush|romantic|pink|roz/.test(p)) return 'atelier';
  if (/warm|artisan|coffee|cafe|bakery|food|home|market|paper|cafea/.test(p)) return 'warmMarket';
  if (/minimal|simple|clean|streetwear|sneaker|hoodie/.test(p)) return 'minimal';
  if (/jewel|bijuter/.test(p)) return 'editorial';
  return /boutique|store|shop/.test(p) ? 'minimal' : 'atelier';
}

export const LAYOUT_CHROME: Record<
  LayoutId,
  Pick<StorefrontTokens, 'navbarStyle' | 'heroLayout' | 'buttonStyle' | 'radius' | 'shadow' | 'headingFont' | 'bodyFont' | 'productCardStyle'>
> = {
  atelier: {
    navbarStyle: 'glass',
    heroLayout: 'split',
    buttonStyle: 'pill',
    radius: 'rounded-xl',
    shadow: 'soft',
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Nunito Sans',
    productCardStyle: 'minimal',
  },
  editorial: {
    navbarStyle: 'transparent',
    heroLayout: 'left',
    buttonStyle: 'outline',
    radius: 'rounded-none',
    shadow: 'none',
    headingFont: 'Playfair Display',
    bodyFont: 'Inter',
    productCardStyle: 'bordered',
  },
  luxeDark: {
    navbarStyle: 'solid',
    heroLayout: 'center',
    buttonStyle: 'outline',
    radius: 'rounded-lg',
    shadow: 'soft',
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Nunito Sans',
    productCardStyle: 'overlay',
  },
  minimal: {
    navbarStyle: 'solid',
    heroLayout: 'center',
    buttonStyle: 'solid',
    radius: 'rounded-none',
    shadow: 'lift',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    productCardStyle: 'minimal',
  },
  warmMarket: {
    navbarStyle: 'glass',
    heroLayout: 'left',
    buttonStyle: 'solid',
    radius: 'rounded-lg',
    shadow: 'soft',
    headingFont: 'Libre Baskerville',
    bodyFont: 'Nunito Sans',
    productCardStyle: 'shadow',
  },
};

export const LAYOUT_VARIANTS: Record<
  LayoutId,
  { density: DensityOption; nav: NavVariant; productCard: ProductCardVariant; hero: HeroVariant }
> = {
  atelier: {
    density: 'airy',
    nav: { style: 'glass', layout: 'logoCenter', showCollections: true, sticky: true },
    productCard: { style: 'minimal', imageRatio: '4/5', showQuickAdd: true, showRating: true },
    hero: { layout: 'split', overlay: 'soft', ctaStyle: 'pill' },
  },
  editorial: {
    density: 'airy',
    nav: { style: 'transparent', layout: 'logoLeft', showCollections: true, sticky: true },
    productCard: { style: 'bordered', imageRatio: '4/5', showQuickAdd: false, showRating: true },
    hero: { layout: 'left', overlay: 'strong', ctaStyle: 'outline' },
  },
  luxeDark: {
    density: 'cozy',
    nav: { style: 'solid', layout: 'logoCenter', showCollections: false, sticky: true },
    productCard: { style: 'overlay', imageRatio: '4/5', showQuickAdd: true, showRating: false },
    hero: { layout: 'fullBleed', overlay: 'strong', ctaStyle: 'outline' },
  },
  minimal: {
    density: 'compact',
    nav: { style: 'solid', layout: 'logoLeft', showCollections: true, sticky: true },
    productCard: { style: 'minimal', imageRatio: '1/1', showQuickAdd: true, showRating: true },
    hero: { layout: 'center', overlay: 'soft', ctaStyle: 'solid' },
  },
  warmMarket: {
    density: 'cozy',
    nav: { style: 'glass', layout: 'split', showCollections: true, sticky: true },
    productCard: { style: 'shadow', imageRatio: '16/10', showQuickAdd: true, showRating: true },
    hero: { layout: 'left', overlay: 'none', ctaStyle: 'solid' },
  },
};

export function applyLayoutChrome(tokens: StorefrontTokens, layoutId: LayoutId): StorefrontTokens {
  return { ...tokens, ...LAYOUT_CHROME[layoutId] };
}

export function isStockHeroUrl(url?: string | null): boolean {
  const value = (url || '').trim();
  if (!value) return true;
  return /unsplash\.com|images\.unsplash/i.test(value);
}

export function variantSummary(spec: StorefrontSpec, language: 'ro' | 'en' = 'en'): string {
  const nav = spec.nav?.style || spec.tokens.navbarStyle;
  const card = spec.productCard?.style || spec.tokens.productCardStyle;
  const hero = spec.hero?.layout || spec.tokens.heroLayout;
  if (language === 'ro') {
    return `${layoutLabel(spec.layoutId, 'ro')} · Nav ${nav} · Carduri ${card} · Hero ${hero}`;
  }
  return `${layoutLabel(spec.layoutId, 'en')} · ${nav} nav · ${card} cards · ${hero} hero`;
}

function sectionCatalog(copy: StorefrontCopy, language: 'ro' | 'en'): Record<string, HomeSection> {
  const ro = language === 'ro';
  return {
    announcement: { id: 'announcement', type: 'announcement', visible: true, props: { text: copy.announcement } },
    header: { id: 'header', type: 'header', visible: true, props: {} },
    hero: {
      id: 'hero',
      type: 'hero',
      visible: true,
      props: {
        title: copy.heroTitle,
        subtitle: copy.heroSubtitle,
        buttonText: copy.heroButtonText,
        imageUrl: copy.heroImageUrl || undefined,
      },
    },
    features: {
      id: 'features',
      type: 'features',
      visible: true,
      props: {
        features: ro
          ? [
              { title: 'Livrare rapidă', body: 'Acasă sau locker, în toată țara.', icon: 'truck' },
              { title: 'Plată flexibilă', body: 'Card sau ramburs.', icon: 'lock' },
              { title: 'Selecție îngrijită', body: 'Stoc actualizat, ales de mână.', icon: 'sparkles' },
            ]
          : [
              { title: 'Fast delivery', body: 'Home or locker, nationwide.', icon: 'truck' },
              { title: 'Flexible payment', body: 'Card or cash on delivery.', icon: 'lock' },
              { title: 'Edited selection', body: 'A tight catalog, always in stock.', icon: 'sparkles' },
            ],
      },
    },
    collections: { id: 'collections', type: 'collections', visible: true, props: { title: ro ? 'Colecții' : 'Collections' } },
    products: { id: 'products', type: 'products', visible: true, props: { title: ro ? 'Produse recomandate' : 'Featured' } },
    about: {
      id: 'about',
      type: 'about',
      visible: true,
      props: { title: ro ? 'Povestea noastră' : 'Our story', text: copy.about },
    },
    reviews: { id: 'reviews', type: 'reviews', visible: true, props: { title: ro ? 'Recenzii' : 'Reviews' } },
    faq: { id: 'faq', type: 'faq', visible: true, props: { title: 'FAQ', faqItems: copy.faq } },
    lookbook: { id: 'lookbook', type: 'lookbook', visible: true, props: { title: 'Lookbook' } },
    marquee: {
      id: 'marquee',
      type: 'marquee',
      visible: true,
      props: { marqueeText: copy.announcement || copy.storeName },
    },
    newsletter: {
      id: 'newsletter',
      type: 'newsletter',
      visible: true,
      props: {
        text: ro ? 'Află primii de noutăți și oferte.' : 'Be first to know about drops and offers.',
        buttonText: ro ? 'Abonează-te' : 'Subscribe',
      },
    },
    footer: { id: 'footer', type: 'footer', visible: true, props: {} },
  };
}

const DEFAULT_ORDERS: Record<LayoutId, SectionType[]> = {
  atelier: ['announcement', 'header', 'hero', 'features', 'collections', 'products', 'about', 'reviews', 'faq', 'footer'],
  editorial: ['header', 'marquee', 'hero', 'lookbook', 'products', 'collections', 'about', 'reviews', 'footer'],
  luxeDark: ['announcement', 'header', 'hero', 'products', 'collections', 'reviews', 'faq', 'footer'],
  minimal: ['header', 'hero', 'products', 'collections', 'reviews', 'footer'],
  warmMarket: ['announcement', 'header', 'hero', 'features', 'about', 'products', 'collections', 'reviews', 'faq', 'footer'],
};

export function sectionsForLayout(
  layoutId: LayoutId,
  copy: StorefrontCopy,
  language: 'ro' | 'en',
  sectionOrder?: SectionType[]
): HomeSection[] {
  const catalog = sectionCatalog(copy, language);
  const order = (sectionOrder?.length ? sectionOrder : DEFAULT_ORDERS[layoutId]) as SectionType[];
  const required: SectionType[] = ['header', 'hero', 'products', 'footer'];
  const seen = new Set<string>();
  const sections: HomeSection[] = [];

  for (const type of order) {
    const section = catalog[type];
    if (!section || seen.has(type)) continue;
    seen.add(type);
    sections.push(section);
  }
  for (const type of required) {
    if (!seen.has(type) && catalog[type]) {
      sections.push(catalog[type]);
      seen.add(type);
    }
  }
  return sections.slice(0, 16);
}

export function withLayout(spec: StorefrontSpec, layoutId: LayoutId, sectionOrder?: SectionType[]): StorefrontSpec {
  const chrome = LAYOUT_CHROME[layoutId];
  const variants = LAYOUT_VARIANTS[layoutId];
  return {
    ...spec,
    layoutId,
    density: variants.density,
    nav: { ...variants.nav, ...(spec.nav || {}) },
    productCard: { ...variants.productCard, ...(spec.productCard || {}) },
    hero: { ...variants.hero, ...(spec.hero || {}) },
    tokens: {
      ...spec.tokens,
      ...chrome,
      navbarStyle: variants.nav.style,
      heroLayout: variants.hero.layout === 'fullBleed' ? 'center' : variants.hero.layout,
      productCardStyle: variants.productCard.style === 'overlay' ? 'shadow' : variants.productCard.style,
      buttonStyle: variants.hero.ctaStyle,
    },
    pages: {
      ...spec.pages,
      home: { sections: sectionsForLayout(layoutId, spec.copy, spec.language, sectionOrder) },
      catalog: {
        ...spec.pages.catalog,
        cardStyle: variants.productCard.style === 'overlay' ? 'shadow' : variants.productCard.style,
      },
    },
  };
}
