/**
 * Canonical content-slot types + sanitizers for curated themes.
 * Shared by: manual editor, saved draft, runtime __SV_CONTENT__, future AI designer.
 * Keep semantics aligned with tools/speedvendors-storefront-runtime/src/storefront/contentSlots.ts.
 */

export type HeroMediaMode = 'template-art' | 'image' | 'featured-product';
export type WhyCardIcon = 'star' | 'art' | 'secure' | 'ship';

/** Shared marketing section ids used by Novatee. */
export type NovateeMarketingSectionId = 'marquee' | 'featured' | 'why';

/** Foundation adds collections / editorial / CTA band — theme-local, not a global Novatee widen. */
export type FoundationMarketingSectionId =
  | NovateeMarketingSectionId
  | 'collections'
  | 'editorial'
  | 'ctaBand';

/** Form/registry union — active theme sanitizer decides which ids survive. */
export type MarketingSectionId = FoundationMarketingSectionId;

export type FoundationExtensionSlots = {
  collectionsEyebrow?: string | null;
  collectionsTitle?: string | null;
  editorialEyebrow?: string | null;
  editorialTitle?: string | null;
  editorialBody?: string | null;
  editorialCtaLabel?: string | null;
  editorialMedia?: MediaSlot | null;
  /** template-art (default) | image | hidden */
  editorialMediaMode?: 'template-art' | 'image' | 'hidden' | null;
  ctaEyebrow?: string | null;
  ctaTitle?: string | null;
  ctaBody?: string | null;
  ctaLabel?: string | null;
  /** Optional soft background behind the CTA band. */
  ctaBackgroundImage?: MediaSlot | null;
  relatedTitle?: string | null;
};

export const FOUNDATION_EXTENSION_LIMITS = {
  collectionsEyebrow: 80,
  collectionsTitle: 120,
  editorialEyebrow: 80,
  editorialTitle: 120,
  editorialBody: 400,
  editorialCtaLabel: 60,
  ctaEyebrow: 80,
  ctaTitle: 120,
  ctaBody: 280,
  ctaLabel: 60,
  relatedTitle: 80,
} as const;

export const NOVATEE_SECTION_IDS = new Set<NovateeMarketingSectionId>(['marquee', 'featured', 'why']);
export const FOUNDATION_SECTION_IDS = new Set<FoundationMarketingSectionId>([
  'marquee',
  'featured',
  'why',
  'collections',
  'editorial',
  'ctaBand',
]);


export type WhyCardSlot = {
  title: string;
  body: string;
  icon: WhyCardIcon;
};

export type MediaSlot = {
  src: string;
  alt?: string;
};

export type HeroStatSlot = {
  title: string;
  subtitle: string;
};

export type SocialLinkSlot = {
  label: string;
  url: string;
};

export type NavLabelsSlot = {
  shop: string;
  featured: string;
  why: string;
  contact: string;
};

export type SectionSlots = {
  /** Unique subset of known marketing section ids, render order. */
  order: MarketingSectionId[];
  /** Optional marketing sections to hide (shop/hero/footer never hideable). */
  hidden: MarketingSectionId[];
};

export type HeroContentSlots = {
  mediaMode: HeroMediaMode;
  image?: MediaSlot | null;
  featuredProductId?: string | null;
  backgroundImage?: MediaSlot | null;
  eyebrow?: string | null;
  /** First headline line (theme default string, e.g. "Wear the"). */
  headline?: string | null;
  /** Gradient accent line (theme default string, e.g. "future."). */
  headlineAccent?: string | null;
  /**
   * Supporting copy under the headline.
   * Null → live merchant name + (tagline || merchantTaglineFallback).
   */
  supportingCopy?: string | null;
  primaryCtaLabel?: string | null;
  secondaryCtaLabel?: string | null;
};

/** Shared fields present on every curated theme. */
export type SharedContentSlots = {
  logo?: MediaSlot | null;
  announcement?: string | null;
  hero: HeroContentSlots;
  marqueeItems?: string[] | null;
  shopEyebrow?: string | null;
  shopTitle?: string | null;
  featuredEyebrow?: string | null;
  featuredFallbackTitle?: string | null;
  featuredFallbackBody?: string | null;
  whyEyebrow?: string | null;
  whyTitle?: string | null;
  whyCards?: WhyCardSlot[] | null;
  footerTagline?: string | null;
  footerPaymentsCopy?: string | null;
  navLabels?: NavLabelsSlot | null;
  heroStats?: HeroStatSlot[] | null;
  footerExploreTitle?: string | null;
  footerPaymentsTitle?: string | null;
  socialLinks?: SocialLinkSlot[] | null;
  /** Used when merchant has no tagline and supportingCopy is null. */
  merchantTaglineFallback?: string | null;
};

export type NovateeContentSlots = SharedContentSlots & {
  sections?: {
    order: NovateeMarketingSectionId[];
    hidden: NovateeMarketingSectionId[];
  } | null;
};

export type FoundationContentSlots = SharedContentSlots &
  FoundationExtensionSlots & {
    sections?: {
      order: FoundationMarketingSectionId[];
      hidden: FoundationMarketingSectionId[];
    } | null;
  };

/**
 * Editor/runtime bag. Theme sanitizers strip unknown fields so Novatee drafts
 * never permanently absorb Foundation-only keys.
 */
export type ContentSlots = SharedContentSlots &
  Partial<FoundationExtensionSlots> & {
    sections?: SectionSlots | null;
  };

const MAX_SRC = 2048;
const MAX_TEXT = 500;
const MAX_MARQUEE = 24;
export const MAX_HERO_STATS = 6;
export const MAX_SOCIAL_LINKS = 8;
export const MAX_HERO_STAT_TITLE = 40;
export const MAX_HERO_STAT_SUBTITLE = 80;

const HERO_MODES = new Set<HeroMediaMode>(['template-art', 'image', 'featured-product']);
const WHY_ICONS = new Set<WhyCardIcon>(['star', 'art', 'secure', 'ship']);
const MARKETING_SECTION_IDS = FOUNDATION_SECTION_IDS;

export function isSafeMediaUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const src = raw.trim();
  if (!src || src.length > MAX_SRC) return false;
  if (/[\u0000-\u001F<>"'`]/.test(src)) return false;
  if (/\.\.(\/|\\|$)/.test(src)) return false;
  if (src.startsWith('/')) {
    if (src.startsWith('//')) return false;
    return /^\/[A-Za-z0-9._~\-/]+$/.test(src);
  }
  if (src.startsWith('./')) {
    return /^\.\/[A-Za-z0-9._~\-/]+$/.test(src);
  }
  try {
    const u = new URL(src);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    return true;
  } catch {
    return false;
  }
}

export function sanitizeMediaSlot(raw: unknown): MediaSlot | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!isSafeMediaUrl(obj.src)) return null;
  const alt = typeof obj.alt === 'string' ? obj.alt.trim().slice(0, 200) : undefined;
  return { src: obj.src.trim(), ...(alt ? { alt } : {}) };
}

function sanitizeText(raw: unknown, max = MAX_TEXT): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.slice(0, max);
}

function sanitizeStringList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    const t = sanitizeText(item, 80);
    if (t) out.push(t);
    if (out.length >= MAX_MARQUEE) break;
  }
  return out.length ? out : null;
}

function sanitizeWhyCards(raw: unknown): WhyCardSlot[] | null {
  if (!Array.isArray(raw)) return null;
  const out: WhyCardSlot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const title = sanitizeText(r.title, 80);
    const body = sanitizeText(r.body, 320);
    const icon =
      typeof r.icon === 'string' && WHY_ICONS.has(r.icon as WhyCardIcon)
        ? (r.icon as WhyCardIcon)
        : null;
    if (title && body && icon) out.push({ title, body, icon });
    if (out.length >= 8) break;
  }
  return out.length ? out : null;
}

function sanitizeNavLabels(raw: unknown): NavLabelsSlot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const shop = sanitizeText(r.shop, 40);
  const featured = sanitizeText(r.featured, 40);
  const why = sanitizeText(r.why, 40);
  const contact = sanitizeText(r.contact, 40);
  if (!shop || !featured || !why || !contact) return null;
  return { shop, featured, why, contact };
}

function sanitizeHeroStats(raw: unknown): HeroStatSlot[] | null {
  if (!Array.isArray(raw)) return null;
  const out: HeroStatSlot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const title = sanitizeText(r.title, MAX_HERO_STAT_TITLE);
    const subtitle = sanitizeText(r.subtitle, MAX_HERO_STAT_SUBTITLE);
    if (title && subtitle) out.push({ title, subtitle });
    if (out.length >= MAX_HERO_STATS) break;
  }
  return out.length ? out : null;
}

function sanitizeSocialLinks(raw: unknown): SocialLinkSlot[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SocialLinkSlot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const label = sanitizeText(r.label, 40);
    if (!label || typeof r.url !== 'string') continue;
    const url = r.url.trim();
    if (!isSafeMediaUrl(url)) continue;
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    } catch {
      continue; // reject relatives — social links must be absolute http(s)
    }
    out.push({ label, url });
    if (out.length >= MAX_SOCIAL_LINKS) break;
  }
  return out.length ? out : null;
}

function sanitizeSections(
  raw: unknown,
  allowed: Set<string> = MARKETING_SECTION_IDS,
): SectionSlots | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const order: MarketingSectionId[] = [];
  const seen = new Set<string>();
  if (Array.isArray(r.order)) {
    for (const id of r.order) {
      if (typeof id !== 'string') continue;
      if (!allowed.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id as MarketingSectionId);
    }
  }

  const hidden: MarketingSectionId[] = [];
  const hiddenSeen = new Set<string>();
  if (Array.isArray(r.hidden)) {
    for (const id of r.hidden) {
      if (typeof id !== 'string') continue;
      if (!allowed.has(id)) continue;
      if (hiddenSeen.has(id)) continue;
      hiddenSeen.add(id);
      hidden.push(id as MarketingSectionId);
    }
  }

  if (!order.length && !hidden.length) return null;
  return { order, hidden };
}

function sanitizeFoundationExtensions(
  o: Record<string, unknown>,
  defaults: ContentSlots,
): FoundationExtensionSlots {
  const lim = FOUNDATION_EXTENSION_LIMITS;
  return {
    collectionsEyebrow:
      o.collectionsEyebrow !== undefined
        ? sanitizeText(o.collectionsEyebrow, lim.collectionsEyebrow)
        : defaults.collectionsEyebrow ?? null,
    collectionsTitle:
      o.collectionsTitle !== undefined
        ? sanitizeText(o.collectionsTitle, lim.collectionsTitle)
        : defaults.collectionsTitle ?? null,
    editorialEyebrow:
      o.editorialEyebrow !== undefined
        ? sanitizeText(o.editorialEyebrow, lim.editorialEyebrow)
        : defaults.editorialEyebrow ?? null,
    editorialTitle:
      o.editorialTitle !== undefined
        ? sanitizeText(o.editorialTitle, lim.editorialTitle)
        : defaults.editorialTitle ?? null,
    editorialBody:
      o.editorialBody !== undefined
        ? sanitizeText(o.editorialBody, lim.editorialBody)
        : defaults.editorialBody ?? null,
    editorialCtaLabel:
      o.editorialCtaLabel !== undefined
        ? sanitizeText(o.editorialCtaLabel, lim.editorialCtaLabel)
        : defaults.editorialCtaLabel ?? null,
    editorialMedia:
      o.editorialMedia !== undefined
        ? sanitizeMediaSlot(o.editorialMedia)
        : defaults.editorialMedia ?? null,
    editorialMediaMode: (() => {
      const raw =
        o.editorialMediaMode !== undefined ? o.editorialMediaMode : defaults.editorialMediaMode;
      return raw === 'image' || raw === 'hidden' || raw === 'template-art' ? raw : 'template-art';
    })(),
    ctaEyebrow:
      o.ctaEyebrow !== undefined ? sanitizeText(o.ctaEyebrow, lim.ctaEyebrow) : defaults.ctaEyebrow ?? null,
    ctaTitle:
      o.ctaTitle !== undefined ? sanitizeText(o.ctaTitle, lim.ctaTitle) : defaults.ctaTitle ?? null,
    ctaBody:
      o.ctaBody !== undefined ? sanitizeText(o.ctaBody, lim.ctaBody) : defaults.ctaBody ?? null,
    ctaLabel:
      o.ctaLabel !== undefined ? sanitizeText(o.ctaLabel, lim.ctaLabel) : defaults.ctaLabel ?? null,
    ctaBackgroundImage:
      o.ctaBackgroundImage !== undefined
        ? sanitizeMediaSlot(o.ctaBackgroundImage)
        : defaults.ctaBackgroundImage ?? null,
    relatedTitle:
      o.relatedTitle !== undefined
        ? sanitizeText(o.relatedTitle, lim.relatedTitle)
        : defaults.relatedTitle ?? null,
  };
}

/** Deep-merge unknown payload onto defaults (safe fields only — never HTML/scripts). */
export function mergeContentSlots(defaults: ContentSlots, override: unknown): ContentSlots {
  if (!override || typeof override !== 'object') return defaults;
  const o = override as Record<string, unknown>;
  const heroIn =
    o.hero && typeof o.hero === 'object' ? (o.hero as Record<string, unknown>) : {};
  const modeRaw = heroIn.mediaMode;
  const mediaMode =
    typeof modeRaw === 'string' && HERO_MODES.has(modeRaw as HeroMediaMode)
      ? (modeRaw as HeroMediaMode)
      : defaults.hero.mediaMode;

  return {
    logo: o.logo !== undefined ? sanitizeMediaSlot(o.logo) : defaults.logo,
    announcement:
      o.announcement !== undefined ? sanitizeText(o.announcement, 120) : defaults.announcement,
    hero: {
      mediaMode,
      image: heroIn.image !== undefined ? sanitizeMediaSlot(heroIn.image) : defaults.hero.image,
      featuredProductId:
        heroIn.featuredProductId !== undefined
          ? sanitizeText(heroIn.featuredProductId, 80)
          : defaults.hero.featuredProductId,
      backgroundImage:
        heroIn.backgroundImage !== undefined
          ? sanitizeMediaSlot(heroIn.backgroundImage)
          : defaults.hero.backgroundImage,
      eyebrow:
        heroIn.eyebrow !== undefined ? sanitizeText(heroIn.eyebrow, 80) : defaults.hero.eyebrow,
      headline:
        heroIn.headline !== undefined ? sanitizeText(heroIn.headline, 120) : defaults.hero.headline,
      headlineAccent:
        heroIn.headlineAccent !== undefined
          ? sanitizeText(heroIn.headlineAccent, 80)
          : defaults.hero.headlineAccent,
      supportingCopy:
        heroIn.supportingCopy !== undefined
          ? sanitizeText(heroIn.supportingCopy, 400)
          : defaults.hero.supportingCopy,
      primaryCtaLabel:
        heroIn.primaryCtaLabel !== undefined
          ? sanitizeText(heroIn.primaryCtaLabel, 60)
          : defaults.hero.primaryCtaLabel,
      secondaryCtaLabel:
        heroIn.secondaryCtaLabel !== undefined
          ? sanitizeText(heroIn.secondaryCtaLabel, 60)
          : defaults.hero.secondaryCtaLabel,
    },
    marqueeItems:
      o.marqueeItems !== undefined ? sanitizeStringList(o.marqueeItems) : defaults.marqueeItems,
    shopEyebrow:
      o.shopEyebrow !== undefined ? sanitizeText(o.shopEyebrow, 80) : defaults.shopEyebrow,
    shopTitle: o.shopTitle !== undefined ? sanitizeText(o.shopTitle, 80) : defaults.shopTitle,
    featuredEyebrow:
      o.featuredEyebrow !== undefined
        ? sanitizeText(o.featuredEyebrow, 80)
        : defaults.featuredEyebrow,
    featuredFallbackTitle:
      o.featuredFallbackTitle !== undefined
        ? sanitizeText(o.featuredFallbackTitle, 120)
        : defaults.featuredFallbackTitle,
    featuredFallbackBody:
      o.featuredFallbackBody !== undefined
        ? sanitizeText(o.featuredFallbackBody, 400)
        : defaults.featuredFallbackBody,
    whyEyebrow: o.whyEyebrow !== undefined ? sanitizeText(o.whyEyebrow, 80) : defaults.whyEyebrow,
    whyTitle: o.whyTitle !== undefined ? sanitizeText(o.whyTitle, 120) : defaults.whyTitle,
    whyCards: o.whyCards !== undefined ? sanitizeWhyCards(o.whyCards) : defaults.whyCards,
    footerTagline:
      o.footerTagline !== undefined ? sanitizeText(o.footerTagline, 240) : defaults.footerTagline,
    footerPaymentsCopy:
      o.footerPaymentsCopy !== undefined
        ? sanitizeText(o.footerPaymentsCopy, 320)
        : defaults.footerPaymentsCopy,
    navLabels: o.navLabels !== undefined ? sanitizeNavLabels(o.navLabels) : defaults.navLabels,
    heroStats: o.heroStats !== undefined ? sanitizeHeroStats(o.heroStats) : defaults.heroStats,
    footerExploreTitle:
      o.footerExploreTitle !== undefined
        ? sanitizeText(o.footerExploreTitle, 40)
        : defaults.footerExploreTitle,
    footerPaymentsTitle:
      o.footerPaymentsTitle !== undefined
        ? sanitizeText(o.footerPaymentsTitle, 40)
        : defaults.footerPaymentsTitle,
    socialLinks:
      o.socialLinks !== undefined ? sanitizeSocialLinks(o.socialLinks) : defaults.socialLinks,
    merchantTaglineFallback:
      o.merchantTaglineFallback !== undefined
        ? sanitizeText(o.merchantTaglineFallback, 400)
        : defaults.merchantTaglineFallback,
    sections: o.sections !== undefined ? sanitizeSections(o.sections) : defaults.sections,
  };
}

export type CuratedThemeSanitizeId = 'novatee' | 'foundation';

/**
 * Registry-dispatched sanitize: active theme determines allowed fields + section ids.
 * Unknown fields are dropped. Existing Novatee drafts stay compatible.
 */
export function mergeThemeContent(
  themeId: CuratedThemeSanitizeId,
  defaults: ContentSlots,
  override: unknown,
): ContentSlots {
  const allowedSections =
    themeId === 'foundation' ? FOUNDATION_SECTION_IDS : NOVATEE_SECTION_IDS;
  const base = mergeContentSlots(defaults, override);
  const o = override && typeof override === 'object' ? (override as Record<string, unknown>) : {};
  const sections =
    o.sections !== undefined
      ? sanitizeSections(o.sections, allowedSections)
      : sanitizeSections(defaults.sections, allowedSections) || defaults.sections || null;

  if (themeId === 'foundation') {
    const ext = sanitizeFoundationExtensions(o, defaults);
    return { ...base, ...ext, sections };
  }

  const {
    collectionsEyebrow: _a,
    collectionsTitle: _b,
    editorialEyebrow: _c,
    editorialTitle: _d,
    editorialBody: _e,
    editorialCtaLabel: _f,
    editorialMedia: _g,
    editorialMediaMode: _gm,
    ctaEyebrow: _h,
    ctaTitle: _i,
    ctaBody: _j,
    ctaLabel: _k,
    ctaBackgroundImage: _kb,
    relatedTitle: _l,
    ...novateeOnly
  } = base;
  void _a;
  void _b;
  void _c;
  void _d;
  void _e;
  void _f;
  void _g;
  void _gm;
  void _h;
  void _i;
  void _j;
  void _k;
  void _kb;
  void _l;
  return { ...novateeOnly, sections };
}
