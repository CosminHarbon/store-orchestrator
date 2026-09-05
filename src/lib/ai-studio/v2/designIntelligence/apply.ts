import type { StorefrontProduct } from '@/lib/storefront/types';
import type { DesignIntelligencePlan, PageNarrativeChapter } from './types';

export function productById(products: StorefrontProduct[], id: string | null | undefined): StorefrontProduct | null {
  if (!id) return null;
  return products.find((p) => p.id === id) || null;
}

export function chaptersOf(plan: DesignIntelligencePlan, purpose: PageNarrativeChapter['purpose']): PageNarrativeChapter[] {
  return plan.page.chapters.filter((c) => c.purpose === purpose);
}

export function isEligible(plan: DesignIntelligencePlan, purpose: PageNarrativeChapter['purpose']): boolean {
  return plan.narrative.some((n) => n.purpose === purpose && n.eligible);
}

/** Assets assigned to a narrative purpose must belong to listed products. */
export function storyAssetsAreOwned(plan: DesignIntelligencePlan, purpose: PageNarrativeChapter['purpose']): boolean {
  const ch = plan.page.chapters.find((c) => c.purpose === purpose);
  if (!ch) return true;
  return ch.assetIds.every((id) => {
    const asset = plan.assets.find((a) => a.id === id);
    if (!asset) return false;
    if (asset.productId && !ch.productIds.includes(asset.productId)) return false;
    return true;
  });
}

export type MonumentSpec = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  imageAlt: string;
  productId: string;
};

const SPEC_TITLES: Record<string, string> = {
  feature: 'Notes',
  form_design: 'Form',
  material: 'Material',
  process_making: 'Make',
  usage: 'Use',
  lifestyle: 'In place',
  comparison: 'Also in the line',
};

function fingerprint(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
}

function chapterBody(
  purpose: string,
  product: StorefrontProduct | null,
  asset: { alt?: string | null } | undefined,
  copy: { subtitle: string; storyBody: string; statement: string }
): string | null {
  const description = (product?.description || '').trim();
  const tags = ((product as { tags?: string[] } | null)?.tags || []).filter(Boolean);
  const sentences = description
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
  let body = '';
  if (purpose === 'feature') {
    body = sentences[1] || (tags.length >= 2 ? tags.slice(0, 4).join(' · ') : '');
  } else if (purpose === 'comparison') {
    body = product?.title || '';
  } else if (asset?.alt && fingerprint(asset.alt) !== fingerprint(description)) {
    body = asset.alt;
  } else if (sentences[1]) {
    body = sentences[1];
  } else if (tags.length) {
    body = tags.slice(0, 4).join(' · ');
  } else {
    body = copy.subtitle && fingerprint(copy.subtitle) !== fingerprint(description) ? copy.subtitle : '';
  }
  if (!body) return null;
  if (description && fingerprint(body) === fingerprint(description)) return null;
  return body;
}

/** Evidence-backed monument chapters. Never uses another product as Form/Make/Use. */
export function monumentSpecs(
  plan: DesignIntelligencePlan,
  products: StorefrontProduct[],
  copy: { subtitle: string; storyBody: string; statement: string }
): MonumentSpec[] {
  const purposes = ['feature', 'form_design', 'material', 'process_making', 'usage', 'lifestyle', 'comparison'] as const;
  const seen = new Set<string>();
  const out: MonumentSpec[] = [];
  for (const purpose of purposes) {
    const ch = plan.page.chapters.find((c) => c.purpose === purpose);
    if (!ch) continue;
    const product = productById(products, ch.productIds[0] || plan.catalog.primaryProductId);
    const asset = plan.assets.find((a) => ch.assetIds.includes(a.id) && (!a.productId || a.productId === product?.id));
    if (purpose === 'feature' && !asset && out.length) continue;
    const body = chapterBody(purpose, product, asset, copy);
    if (!body) continue;
    const fp = fingerprint(body);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push({
      id: ch.id,
      title: SPEC_TITLES[purpose] || purpose,
      body,
      imageUrl: asset?.url || null,
      imageAlt: product?.title || '',
      productId: product?.id || '',
    });
  }
  return out;
}

export function supportingProducts(plan: DesignIntelligencePlan, products: StorefrontProduct[]): StorefrontProduct[] {
  const ids = plan.catalog.supportingProductIds;
  return ids.map((id) => products.find((p) => p.id === id)).filter((p): p is StorefrontProduct => Boolean(p));
}

/** Primary first, then supporting, then remaining. Used by DEV intelligent preview only. */
export function reorderProductsForPlan(plan: DesignIntelligencePlan, products: StorefrontProduct[]): StorefrontProduct[] {
  const primary = productById(products, plan.catalog.primaryProductId);
  const support = supportingProducts(plan, products);
  const seen = new Set([primary?.id, ...support.map((p) => p.id)].filter(Boolean) as string[]);
  return [primary, ...support, ...products.filter((p) => !seen.has(p.id))].filter((p): p is StorefrontProduct => Boolean(p));
}

export function storyChapterOwnsOnlyAssignedProducts(plan: DesignIntelligencePlan): boolean {
  const story = ['form_design', 'material', 'process_making', 'usage', 'lifestyle'] as const;
  return story.every((purpose) => storyAssetsAreOwned(plan, purpose));
}
