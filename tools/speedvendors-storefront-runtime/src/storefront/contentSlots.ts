/**
 * EDITABLE content-slot contract for template presentation.
 * Layout/theme stay in CSS; merchants later fill slots (no HTML / no executables).
 */
export type HeroMediaMode = 'template-art' | 'image' | 'featured-product';

export type WhyCardIcon = 'star' | 'art' | 'secure' | 'ship';

/** Optional marketing sections that may be reordered or hidden. */
export type MarketingSectionId = 'marquee' | 'featured' | 'why';

export type WhyCardSlot = {
  title: string;
  body: string;
  icon: WhyCardIcon;
};

/** Plain media reference — relative path or http(s) only. */
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
  /** Default: template-art (approved Novatee decorative tees). */
  mediaMode: HeroMediaMode;
  /** Used when mediaMode === 'image'. */
  image?: MediaSlot | null;
  /**
   * Optional durable product id for featured-product mode.
   * Empty → first live featured / catalog product with an image.
   */
  featuredProductId?: string | null;
  /** Optional full-bleed promotional background behind orbs/grain. */
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

export type ContentSlots = {
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
  sections?: SectionSlots | null;
};

const MAX_SRC = 2048;
const MAX_TEXT = 500;
const MAX_MARQUEE = 24;
export const MAX_HERO_STATS = 6;
export const MAX_SOCIAL_LINKS = 8;
export const MAX_HERO_STAT_TITLE = 40;
export const MAX_HERO_STAT_SUBTITLE = 80;

const MARKETING_SECTION_IDS = new Set<MarketingSectionId>(['marquee', 'featured', 'why']);

/** Accept only same-origin relative paths or http(s) URLs — never javascript:/data: blobs. */
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
  const alt =
    typeof obj.alt === 'string' ? obj.alt.trim().slice(0, 200) : undefined;
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

const WHY_ICONS = new Set<WhyCardIcon>(['star', 'art', 'secure', 'ship']);

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

function sanitizeSections(raw: unknown): SectionSlots | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const order: MarketingSectionId[] = [];
  const seen = new Set<MarketingSectionId>();
  if (Array.isArray(r.order)) {
    for (const id of r.order) {
      if (typeof id !== 'string') continue;
      if (!MARKETING_SECTION_IDS.has(id as MarketingSectionId)) continue;
      const sid = id as MarketingSectionId;
      if (seen.has(sid)) continue;
      seen.add(sid);
      order.push(sid);
    }
  }

  const hidden: MarketingSectionId[] = [];
  const hiddenSeen = new Set<MarketingSectionId>();
  if (Array.isArray(r.hidden)) {
    for (const id of r.hidden) {
      if (typeof id !== 'string') continue;
      if (!MARKETING_SECTION_IDS.has(id as MarketingSectionId)) continue;
      const sid = id as MarketingSectionId;
      if (hiddenSeen.has(sid)) continue;
      hiddenSeen.add(sid);
      hidden.push(sid);
    }
  }

  if (!order.length && !hidden.length) return null;
  return { order, hidden };
}

const HERO_MODES = new Set<HeroMediaMode>(['template-art', 'image', 'featured-product']);

/** Deep-merge a partial/unknown payload onto theme defaults (safe fields only). */
export function mergeContentSlots(
  defaults: ContentSlots,
  override: unknown,
): ContentSlots {
  if (!override || typeof override !== 'object') return defaults;
  const o = override as Record<string, unknown>;
  const heroIn =
    o.hero && typeof o.hero === 'object'
      ? (o.hero as Record<string, unknown>)
      : {};

  const modeRaw = heroIn.mediaMode;
  const mediaMode =
    typeof modeRaw === 'string' && HERO_MODES.has(modeRaw as HeroMediaMode)
      ? (modeRaw as HeroMediaMode)
      : defaults.hero.mediaMode;

  return {
    logo: o.logo !== undefined ? sanitizeMediaSlot(o.logo) : defaults.logo,
    announcement:
      o.announcement !== undefined
        ? sanitizeText(o.announcement, 120)
        : defaults.announcement,
    hero: {
      mediaMode,
      image:
        heroIn.image !== undefined
          ? sanitizeMediaSlot(heroIn.image)
          : defaults.hero.image,
      featuredProductId:
        heroIn.featuredProductId !== undefined
          ? sanitizeText(heroIn.featuredProductId, 80)
          : defaults.hero.featuredProductId,
      backgroundImage:
        heroIn.backgroundImage !== undefined
          ? sanitizeMediaSlot(heroIn.backgroundImage)
          : defaults.hero.backgroundImage,
      eyebrow:
        heroIn.eyebrow !== undefined
          ? sanitizeText(heroIn.eyebrow, 80)
          : defaults.hero.eyebrow,
      headline:
        heroIn.headline !== undefined
          ? sanitizeText(heroIn.headline, 120)
          : defaults.hero.headline,
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
      o.marqueeItems !== undefined
        ? sanitizeStringList(o.marqueeItems)
        : defaults.marqueeItems,
    shopEyebrow:
      o.shopEyebrow !== undefined
        ? sanitizeText(o.shopEyebrow, 80)
        : defaults.shopEyebrow,
    shopTitle:
      o.shopTitle !== undefined ? sanitizeText(o.shopTitle, 80) : defaults.shopTitle,
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
    whyEyebrow:
      o.whyEyebrow !== undefined ? sanitizeText(o.whyEyebrow, 80) : defaults.whyEyebrow,
    whyTitle:
      o.whyTitle !== undefined ? sanitizeText(o.whyTitle, 120) : defaults.whyTitle,
    whyCards:
      o.whyCards !== undefined ? sanitizeWhyCards(o.whyCards) : defaults.whyCards,
    footerTagline:
      o.footerTagline !== undefined
        ? sanitizeText(o.footerTagline, 240)
        : defaults.footerTagline,
    footerPaymentsCopy:
      o.footerPaymentsCopy !== undefined
        ? sanitizeText(o.footerPaymentsCopy, 320)
        : defaults.footerPaymentsCopy,
    navLabels:
      o.navLabels !== undefined ? sanitizeNavLabels(o.navLabels) : defaults.navLabels,
    heroStats:
      o.heroStats !== undefined ? sanitizeHeroStats(o.heroStats) : defaults.heroStats,
    footerExploreTitle:
      o.footerExploreTitle !== undefined
        ? sanitizeText(o.footerExploreTitle, 40)
        : defaults.footerExploreTitle,
    footerPaymentsTitle:
      o.footerPaymentsTitle !== undefined
        ? sanitizeText(o.footerPaymentsTitle, 40)
        : defaults.footerPaymentsTitle,
    socialLinks:
      o.socialLinks !== undefined
        ? sanitizeSocialLinks(o.socialLinks)
        : defaults.socialLinks,
    merchantTaglineFallback:
      o.merchantTaglineFallback !== undefined
        ? sanitizeText(o.merchantTaglineFallback, 400)
        : defaults.merchantTaglineFallback,
    sections:
      o.sections !== undefined ? sanitizeSections(o.sections) : defaults.sections,
  };
}

declare global {
  interface Window {
    /**
     * Optional merchant/template content overrides (plain JSON, no HTML).
     * Set `allowPreviewQueryHints: true` only in local injected previews.
     */
    __SV_CONTENT__?: unknown;
    /** Optional allowlisted theme id (e.g. "novatee"). */
    __SV_THEME__?: unknown;
  }
}

/** Local-only: URL ?sv_hero= hints require an explicit injected flag. */
export function previewQueryHintsAllowed(raw: unknown = typeof window !== 'undefined' ? window.__SV_CONTENT__ : null): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return o.allowPreviewQueryHints === true || o.previewQueryHints === true;
}

/**
 * Resolve slots: theme defaults ← window.__SV_CONTENT__
 * Optional ?sv_hero= only when allowPreviewQueryHints is explicitly injected.
 */
export function resolveContentSlots(defaults: ContentSlots): ContentSlots {
  const injected = typeof window !== 'undefined' ? window.__SV_CONTENT__ : null;
  let merged = mergeContentSlots(defaults, injected);

  if (typeof window !== 'undefined' && previewQueryHintsAllowed(injected)) {
    try {
      const hint = new URLSearchParams(window.location.search).get('sv_hero');
      if (hint === 'image' || hint === 'featured-product' || hint === 'template-art') {
        merged = {
          ...merged,
          hero: {
            ...merged.hero,
            mediaMode: hint,
            image:
              hint === 'image'
                ? merged.hero.image || {
                    src: '/slot-preview-hero.svg',
                    alt: 'Preview hero image',
                  }
                : merged.hero.image,
          },
        };
      }
      if (hint === 'broken-image') {
        merged = {
          ...merged,
          hero: {
            ...merged.hero,
            mediaMode: 'image',
            image: {
              src: '/this-asset-does-not-exist-404.png',
              alt: 'Broken preview',
            },
          },
        };
      }
    } catch {
      /* ignore bad location */
    }
  }

  return merged;
}
