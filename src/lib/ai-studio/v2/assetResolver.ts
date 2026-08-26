/**
 * Central asset resolution for the V2 renderer (Stage 1).
 *
 * Before this module every composition ran its own fallback — `commerce.products[0]?.image`,
 * `commerce.bestSellers[0]`, `resolveProducts(..., limit 1)` — so a page with six distinct
 * product photos rendered the first one in every single-image slot.
 *
 * The plan is computed once per document, in document order, and assigns each single-image
 * slot a *distinct* product until the candidate list is exhausted. It is fully deterministic:
 * the same SiteTree plus the same catalog always yields the same assignment. No randomness.
 *
 * Merchant data is authoritative. This module only ever *selects* from the catalog it is
 * given; it never invents, rewrites, or substitutes product data or imagery.
 */
import type { StorefrontProduct } from '@/lib/storefront/types';
import type { SiteNode } from '@/lib/ai-studio/v2/siteTree';

/** Where a rendered asset came from. Demo imagery must never be mistaken for merchant media. */
export type AssetProvenance = 'merchant' | 'demo' | 'fallback';

export type AssetSource =
  /** Explicit `content.imageUrl` on the node — authored, not resolved. */
  | 'authored'
  /** Picked from the catalog, not yet used elsewhere on the page. */
  | 'catalog'
  /** Picked from the catalog after candidates were exhausted (deliberate, deterministic reuse). */
  | 'catalog_reuse'
  /** No image available — the composition renders its CSS media block. */
  | 'none';

/** What kind of media the composition consumes. */
export type AssetSlot =
  /** One image, no product chrome. */
  | 'image'
  /** One product (image + title/price/open handler). */
  | 'product'
  /** Many products via `resolveProducts` — not part of single-slot rotation. */
  | 'multi'
  /** No media. */
  | 'none';

/**
 * Structural subset of StorefrontCommerce. Kept minimal so the resolver stays testable
 * without constructing a full commerce object.
 */
export type AssetCatalog = {
  products: StorefrontProduct[];
  bestSellers?: StorefrontProduct[];
  newestProducts?: StorefrontProduct[];
  collections?: Array<{ id: string }>;
  /** True for demo/fixture catalogs. Drives provenance. */
  demo?: boolean;
};

export type ResolvedAsset = {
  slot: AssetSlot;
  imageUrl: string | null;
  product: StorefrontProduct | null;
  source: AssetSource;
  provenance: AssetProvenance | null;
};

export type AssetPlanNode = {
  nodeId: string;
  type: string;
  variant: string;
  slot: AssetSlot;
  source: AssetSource;
  provenance: AssetProvenance | null;
  productId: string | null;
  /** Short stable hash — full URLs are noise in diagnostics. */
  imageId: string | null;
  binding: string | null;
  /** Multi-product nodes report what they will show. */
  productIds?: string[];
};

export type AssetPlanSummary = {
  /** Distinct images across single-image slots. */
  uniqueImageCount: number;
  /** Single-image slots that repeat an image already used earlier on the page. */
  duplicateImageCount: number;
  /** Single-image slots that resolved to no image at all. */
  fallbackImageCount: number;
  /** Slots whose image came from `content.imageUrl`. */
  authoredImageCount: number;
  singleImageSlotCount: number;
  provenance: Record<AssetProvenance, number>;
  productIdsUsed: string[];
  nodes: AssetPlanNode[];
};

export type AssetPlan = {
  byNodeId: Record<string, ResolvedAsset>;
  summary: AssetPlanSummary;
};

export const EMPTY_ASSET: ResolvedAsset = {
  slot: 'none',
  imageUrl: null,
  product: null,
  source: 'none',
  provenance: null,
};

/** Compositions that consume exactly one image or one product. */
const SINGLE_SLOTS: Record<string, AssetSlot> = {
  'hero:editorial_split': 'image',
  'hero:luxury_minimal': 'image',
  'hero:product_focus': 'product',
  'productSpotlight:feature': 'product',
  'editorialSplit:image_text': 'image',
  'testimonials:editorial': 'image',
};

/** Compositions that render a list through `resolveProducts`. */
const MULTI_SLOTS = new Set(['productGrid', 'productRail', 'editorialMosaic']);

function slotForNode(node: SiteNode): AssetSlot {
  if (MULTI_SLOTS.has(node.type)) return 'multi';
  const slot = SINGLE_SLOTS[`${node.type}:${node.variant}`];
  if (!slot) return 'none';
  // Testimonials only render a photo in the imageQuote layout.
  if (node.type === 'testimonials' && node.content?.layout !== 'imageQuote') return 'none';
  return slot;
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * `featured` = the merchant's own catalog order, in-stock first.
 *
 * This is deliberately NOT an alias for `bestsellers` (a discount/recency heuristic) or
 * `newest` (reverse-chronological). Before Stage 1 the binding had no resolver branch and
 * silently fell through to `bestSellers`, which made every product node identical.
 * Out-of-stock items are kept at the end rather than dropped, so nothing disappears
 * from a merchant's storefront because of stock.
 */
export function featuredProducts(catalog: AssetCatalog): StorefrontProduct[] {
  const inStock = catalog.products.filter((p) => (p.stock ?? 0) > 0);
  if (!inStock.length) return catalog.products;
  return [...inStock, ...catalog.products.filter((p) => (p.stock ?? 0) <= 0)];
}

export function productsForBinding(
  binding: string | undefined,
  catalog: AssetCatalog,
  collectionId?: string
): StorefrontProduct[] {
  const fallback = () => featuredProducts(catalog);
  switch (binding) {
    case 'bestsellers':
      return catalog.bestSellers?.length ? catalog.bestSellers : fallback();
    case 'newest':
      return catalog.newestProducts?.length ? catalog.newestProducts : fallback();
    case 'collection': {
      if (!collectionId) return fallback();
      const scoped = catalog.products.filter((p) => p.collection_ids?.includes(collectionId));
      return scoped.length ? scoped : fallback();
    }
    case 'featured':
    default:
      return fallback();
  }
}

/** Small stable hash so diagnostics can compare assets without printing full URLs. */
export function shortImageId(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i += 1) {
    hash = ((hash << 5) + hash + url.charCodeAt(i)) | 0;
  }
  return `img_${(hash >>> 0).toString(36)}`;
}

function provenanceForCatalog(catalog: AssetCatalog): AssetProvenance {
  return catalog.demo ? 'demo' : 'merchant';
}

function provenanceForUrl(url: string, catalog: AssetCatalog): AssetProvenance {
  const known = catalog.products.some((p) => p.image === url);
  return known ? provenanceForCatalog(catalog) : 'fallback';
}

/**
 * Assign one asset per single-image slot, in document order, preferring products not yet
 * used on the page. Multi-product nodes are recorded for diagnostics but keep resolving
 * through `resolveProducts` so list bindings stay untouched.
 */
export function buildAssetPlan(input: { nodes: SiteNode[]; catalog: AssetCatalog }): AssetPlan {
  const { nodes, catalog } = input;
  const byNodeId: Record<string, ResolvedAsset> = {};
  const planNodes: AssetPlanNode[] = [];
  const usedProductIds = new Set<string>();
  const imageUseCount = new Map<string, number>();
  const provenanceTally: Record<AssetProvenance, number> = { merchant: 0, demo: 0, fallback: 0 };

  let singleImageSlotCount = 0;
  let duplicateImageCount = 0;
  let fallbackImageCount = 0;
  let authoredImageCount = 0;
  let assignedFromCatalog = 0;

  for (const node of nodes) {
    if (node.visible === false) continue;
    const slot = slotForNode(node);
    const binding = node.dataBindings?.products ?? null;

    if (slot === 'none') {
      byNodeId[node.id] = EMPTY_ASSET;
      planNodes.push({
        nodeId: node.id,
        type: node.type,
        variant: node.variant,
        slot: 'none',
        source: 'none',
        provenance: null,
        productId: null,
        imageId: null,
        binding,
      });
      continue;
    }

    if (slot === 'multi') {
      const list = productsForBinding(
        binding ?? undefined,
        catalog,
        node.dataBindings?.collectionId
      ).slice(0, node.dataBindings?.limit ?? 8);
      byNodeId[node.id] = { ...EMPTY_ASSET, slot: 'multi' };
      planNodes.push({
        nodeId: node.id,
        type: node.type,
        variant: node.variant,
        slot: 'multi',
        source: list.length ? 'catalog' : 'none',
        provenance: list.length ? provenanceForCatalog(catalog) : null,
        productId: null,
        imageId: null,
        binding: binding ?? 'featured',
        productIds: list.map((p) => p.id),
      });
      continue;
    }

    singleImageSlotCount += 1;

    const authored = text(node.content?.imageUrl);
    if (authored) {
      const provenance = provenanceForUrl(authored, catalog);
      byNodeId[node.id] = {
        slot,
        imageUrl: authored,
        product: null,
        source: 'authored',
        provenance,
      };
      authoredImageCount += 1;
      provenanceTally[provenance] += 1;
      const seen = imageUseCount.get(authored) ?? 0;
      if (seen > 0) duplicateImageCount += 1;
      imageUseCount.set(authored, seen + 1);
      planNodes.push({
        nodeId: node.id,
        type: node.type,
        variant: node.variant,
        slot,
        source: 'authored',
        provenance,
        productId: null,
        imageId: shortImageId(authored),
        binding,
      });
      continue;
    }

    const candidates = productsForBinding(
      binding ?? undefined,
      catalog,
      node.dataBindings?.collectionId
    ).filter((p) => text(p.image));

    let product = candidates.find((p) => !usedProductIds.has(p.id)) ?? null;
    let source: AssetSource = 'catalog';

    if (!product && candidates.length) {
      // Exhausted: cycle by assignment count so consecutive reuses differ instead of
      // every slot collapsing back onto the first product.
      product = candidates[assignedFromCatalog % candidates.length];
      source = 'catalog_reuse';
    }

    if (!product) {
      byNodeId[node.id] = { ...EMPTY_ASSET, slot };
      fallbackImageCount += 1;
      planNodes.push({
        nodeId: node.id,
        type: node.type,
        variant: node.variant,
        slot,
        source: 'none',
        provenance: null,
        productId: null,
        imageId: null,
        binding,
      });
      continue;
    }

    const provenance = provenanceForCatalog(catalog);
    const imageUrl = product.image;
    usedProductIds.add(product.id);
    assignedFromCatalog += 1;
    provenanceTally[provenance] += 1;
    const seen = imageUseCount.get(imageUrl) ?? 0;
    if (seen > 0) duplicateImageCount += 1;
    imageUseCount.set(imageUrl, seen + 1);

    byNodeId[node.id] = { slot, imageUrl, product, source, provenance };
    planNodes.push({
      nodeId: node.id,
      type: node.type,
      variant: node.variant,
      slot,
      source,
      provenance,
      productId: product.id,
      imageId: shortImageId(imageUrl),
      binding,
    });
  }

  return {
    byNodeId,
    summary: {
      uniqueImageCount: imageUseCount.size,
      duplicateImageCount,
      fallbackImageCount,
      authoredImageCount,
      singleImageSlotCount,
      provenance: provenanceTally,
      productIdsUsed: [...usedProductIds],
      nodes: planNodes,
    },
  };
}

export function assetForNode(plan: AssetPlan | null | undefined, nodeId: string): ResolvedAsset {
  return plan?.byNodeId[nodeId] ?? EMPTY_ASSET;
}
