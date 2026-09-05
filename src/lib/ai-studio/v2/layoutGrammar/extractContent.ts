import type { SiteDocument, SiteNode } from '@/lib/ai-studio/v2/siteTree';
import type { StorefrontCollection, StorefrontProduct, StorefrontReview } from '@/lib/storefront/types';
import { COMPOSITION_TYPES } from '@/lib/ai-studio/v2/siteTree';

function str(v: unknown, fallback = '') {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

export type SemanticCopy = {
  storeName: string;
  kicker: string;
  title: string;
  subtitle: string;
  cta: string;
  statement: string;
  storyTitle: string;
  storyBody: string;
  storyImage: string;
  heroImage: string;
  merchTitle: string;
  footerBlurb: string;
  announcement: string;
};

export type SemanticPage = {
  copy: SemanticCopy;
  language: 'ro' | 'en';
  nodes: SiteNode[];
  nodeByType: Partial<Record<SiteNode['type'], SiteNode>>;
  compositionIds: string[];
  products: StorefrontProduct[];
  collections: StorefrontCollection[];
  reviews: StorefrontReview[];
  featured: StorefrontProduct | null;
};

export type CatalogSlice = {
  products: StorefrontProduct[];
  collections?: StorefrontCollection[];
  reviews?: StorefrontReview[];
};

export function extractSemanticPage(document: SiteDocument, catalog: CatalogSlice): SemanticPage {
  const nodes = document.pages.home.nodes.filter((n) => n.visible !== false);
  const nodeByType: SemanticPage['nodeByType'] = {};
  for (const n of nodes) {
    if (!nodeByType[n.type]) nodeByType[n.type] = n;
  }
  const hero = nodeByType.hero;
  const nav = nodeByType.nav;
  const statement = nodeByType.brandStatement;
  const story = nodeByType.editorialSplit;
  const merch = nodeByType.productGrid || nodeByType.productRail || nodeByType.productSpotlight;
  const footer = nodeByType.footer;
  const announcement = nodeByType.announcement;

  const products = catalog.products || [];
  const featured = products[0] || null;

  const copy: SemanticCopy = {
    storeName: str(nav?.content.storeName, str(footer?.content.storeName, 'Store')),
    kicker: str(hero?.content.kicker, 'Collection'),
    title: str(hero?.content.title, featured?.title || 'The collection'),
    subtitle: str(hero?.content.subtitle, featured?.description || ''),
    cta: str(hero?.content.cta, 'View products'),
    statement: str(statement?.content.statement, str(hero?.content.subtitle, '')),
    storyTitle: str(story?.content.title, 'Craft'),
    storyBody: str(story?.content.body, str(featured?.description, '')),
    storyImage: str(story?.content.imageUrl, str(hero?.content.imageUrl, featured?.image || '')),
    heroImage: str(hero?.content.imageUrl, featured?.image || ''),
    merchTitle: str(merch?.content.title, 'The collection'),
    footerBlurb: str(footer?.content.blurb, str(footer?.content.text, '')),
    announcement: str(announcement?.content.text, ''),
  };

  const compositionIds = nodes.map((n) => `${n.type}:${n.variant}`);
  const known = new Set(COMPOSITION_TYPES as readonly string[]);
  for (const n of nodes) {
    if (!known.has(n.type)) {
      throw new Error(`Invalid composition type: ${n.type}`);
    }
  }

  return {
    copy,
    language: document.meta.language,
    nodes,
    nodeByType,
    compositionIds,
    products,
    collections: catalog.collections || [],
    reviews: catalog.reviews || [],
    featured,
  };
}

export function clampCopy(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const slice = t.slice(0, maxChars - 1);
  const sp = slice.lastIndexOf(' ');
  return `${(sp > 40 ? slice.slice(0, sp) : slice).trim()}…`;
}

export function displayLines(title: string, maxLines = 3): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return [title];
  const lines: string[] = [];
  const chunk = Math.ceil(words.length / Math.min(maxLines, words.length));
  for (let i = 0; i < words.length; i += chunk) {
    lines.push(words.slice(i, i + chunk).join(' '));
  }
  return lines.slice(0, maxLines);
}
