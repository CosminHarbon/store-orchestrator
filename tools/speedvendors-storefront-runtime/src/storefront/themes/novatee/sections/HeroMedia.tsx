// EDITABLE: hero media slot with safe fallback to Novatee template art.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProduct, useProducts } from '../../../../speedvendors';
import type { HeroContentSlots, MediaSlot } from '../../../contentSlots';
import { isSafeMediaUrl } from '../../../contentSlots';
import HeroArt from './HeroArt';

export interface HeroMediaProps {
  hero: HeroContentSlots;
  /** Live featured ids from merchandising (commerce), never invented. */
  featuredProductIds?: string[];
}

function useMarkReadyWhenComplete(
  src: string | null | undefined,
  onReady: () => void,
  onFail: () => void,
) {
  const ref = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;
    if (el.complete) {
      // SVG previews often report naturalWidth 0; still treat as loaded when complete.
      const isSvg = /\.svg(\?|#|$)/i.test(src);
      if (el.naturalWidth > 0 || isSvg) onReady();
      else onFail();
    }
  }, [src, onReady, onFail]);
  return ref;
}

function FeaturedProductMedia({
  productId,
  fallbackIds,
  onFail,
  onReady,
}: {
  productId?: string | null;
  fallbackIds?: string[];
  onFail: () => void;
  onReady: () => void;
}) {
  const { data: products, loading: listLoading } = useProducts({});
  const preferredId = useMemo(() => {
    if (productId) return productId;
    if (products?.length && fallbackIds?.length) {
      for (const id of fallbackIds) {
        const match = products.find((p) => p.id === id && p.images?.[0]?.url);
        if (match) return match.id;
      }
    }
    const withImage = (products || []).find((p) => p.images?.[0]?.url);
    if (withImage) return withImage.id;
    return fallbackIds?.[0] || null;
  }, [productId, fallbackIds, products]);

  const { data: product, loading: productLoading } = useProduct(preferredId);

  useEffect(() => {
    if (listLoading || productLoading) return;
    if (!preferredId) {
      onFail();
      return;
    }
    const url = product?.images?.[0]?.url;
    if (!product || !url || !isSafeMediaUrl(url)) {
      onFail();
    }
  }, [listLoading, productLoading, preferredId, product, onFail]);

  const img = product?.images?.[0];
  const src = img?.url && isSafeMediaUrl(img.url) ? img.url : null;
  const ref = useMarkReadyWhenComplete(src, onReady, onFail);

  if (!src) return null;

  return (
    <img
      ref={ref}
      className="sf-hero__media-img is-ready"
      src={src}
      alt={img?.alt || product?.title || ''}
      loading="eager"
      decoding="async"
      onLoad={onReady}
      onError={onFail}
    />
  );
}

export default function HeroMedia({ hero, featuredProductIds = [] }: HeroMediaProps) {
  const [failed, setFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    setFailed(false);
    setImageReady(false);
  }, [hero.mediaMode, hero.image?.src, hero.featuredProductId, featuredProductIds.join('|')]);

  const fail = useCallback(() => {
    setFailed(true);
    setImageReady(false);
  }, []);
  const ready = useCallback(() => setImageReady(true), []);

  const mode = failed ? 'template-art' : hero.mediaMode;
  const imageSrc =
    mode === 'image' && hero.image && isSafeMediaUrl(hero.image.src) ? hero.image.src : null;
  const imageRef = useMarkReadyWhenComplete(imageSrc, ready, fail);

  if (mode === 'image') {
    if (!imageSrc || !hero.image) {
      return <HeroArt />;
    }
    return (
      <div className="sf-hero__art sf-hero__art--photo">
        {!imageReady ? <HeroArt /> : null}
        <img
          ref={(el) => {
            imageRef.current = el;
            if (el && /\.svg(\?|#|$)/i.test(imageSrc)) {
              // SVG <img> often skips load events / reports 0×0 in headless.
              queueMicrotask(() => ready());
            }
          }}
          className={`sf-hero__media-img${imageReady ? ' is-ready' : ''}`}
          src={imageSrc}
          alt={hero.image.alt || ''}
          loading="eager"
          decoding="async"
          onLoad={ready}
          onError={fail}
        />
      </div>
    );
  }

  if (mode === 'featured-product') {
    return (
      <div className="sf-hero__art sf-hero__art--photo">
        {!imageReady ? <HeroArt /> : null}
        <FeaturedProductMedia
          productId={hero.featuredProductId}
          fallbackIds={featuredProductIds}
          onFail={fail}
          onReady={ready}
        />
      </div>
    );
  }

  return <HeroArt />;
}

export function HeroBackground({ media }: { media?: MediaSlot | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [media?.src]);
  if (!media || failed || !isSafeMediaUrl(media.src)) return null;
  return (
    <img
      className="sf-hero__promo-bg"
      src={media.src}
      alt=""
      aria-hidden="true"
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
