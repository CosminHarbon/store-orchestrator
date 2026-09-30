import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatPrice, useProduct, useProducts } from '../../../../speedvendors';
import type { HeroContentSlots } from '../../../contentSlots';
import { isSafeMediaUrl } from '../../../contentSlots';
import HeroArt from './HeroArt';

function useMarkReady(src: string | null | undefined, onReady: () => void, onFail: () => void) {
  const ref = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;
    if (el.complete) {
      const isSvg = /\.svg(\?|#|$)/i.test(src);
      if (el.naturalWidth > 0 || isSvg) onReady();
      else onFail();
    }
  }, [src, onReady, onFail]);
  return ref;
}

function orientationClass(img: HTMLImageElement | null): string {
  if (!img || !img.naturalWidth || !img.naturalHeight) return '';
  const ratio = img.naturalWidth / img.naturalHeight;
  if (ratio < 0.95) return ' fd-hero__media--portrait';
  if (ratio > 1.15) return ' fd-hero__media--landscape';
  return '';
}

export default function HeroMedia({
  hero,
  featuredProductIds = [],
  onOpenProduct,
}: {
  hero: HeroContentSlots;
  featuredProductIds?: string[];
  onOpenProduct?: (id: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [orient, setOrient] = useState('');

  useEffect(() => {
    setFailed(false);
    setImageReady(false);
    setOrient('');
  }, [hero.mediaMode, hero.image?.src, hero.featuredProductId, featuredProductIds.join('|')]);

  const fail = useCallback(() => {
    setFailed(true);
    setImageReady(false);
  }, []);
  const ready = useCallback((el?: HTMLImageElement | null) => {
    setImageReady(true);
    setOrient(orientationClass(el || null));
  }, []);

  const mode = failed ? 'template-art' : hero.mediaMode;
  const imageSrc =
    mode === 'image' && hero.image && isSafeMediaUrl(hero.image.src) ? hero.image.src : null;
  const imageRef = useMarkReady(imageSrc, () => ready(imageRef.current), fail);

  const { data: products } = useProducts({});
  const preferredId = useMemo(() => {
    if (hero.featuredProductId) return hero.featuredProductId;
    for (const id of featuredProductIds) {
      const match = (products || []).find((p) => p.id === id && p.images?.[0]?.url);
      if (match) return match.id;
    }
    return (products || []).find((p) => p.images?.[0]?.url)?.id || null;
  }, [hero.featuredProductId, featuredProductIds, products]);
  const { data: featuredProduct } = useProduct(mode === 'featured-product' ? preferredId : null);
  const featuredSrc =
    featuredProduct?.images?.[0]?.url && isSafeMediaUrl(featuredProduct.images[0].url)
      ? featuredProduct.images[0].url
      : null;
  const featuredRef = useMarkReady(featuredSrc, () => ready(featuredRef.current), fail);

  if (mode === 'image' && imageSrc && hero.image) {
    return (
      <figure className={`fd-hero__media fd-hero__media--image${orient}${imageReady ? ' is-ready' : ''}`}>
        {!imageReady ? <HeroArt /> : null}
        <img
          ref={(el) => {
            imageRef.current = el;
          }}
          src={imageSrc}
          alt={hero.image.alt || ''}
          loading="eager"
          decoding="async"
          onLoad={(e) => ready(e.currentTarget)}
          onError={fail}
        />
      </figure>
    );
  }

  if (mode === 'featured-product' && featuredSrc && featuredProduct) {
    return (
      <figure className={`fd-hero__media fd-hero__media--product${orient}${imageReady ? ' is-ready' : ''}`}>
        {!imageReady ? <HeroArt /> : null}
        <img
          ref={(el) => {
            featuredRef.current = el;
          }}
          src={featuredSrc}
          alt={featuredProduct.images[0]?.alt || featuredProduct.title}
          loading="eager"
          decoding="async"
          onLoad={(e) => ready(e.currentTarget)}
          onError={fail}
        />
        <button
          type="button"
          className="fd-hero__product-tag"
          onClick={() => onOpenProduct?.(featuredProduct.id)}
        >
          <span>{featuredProduct.title}</span>
          <strong>{formatPrice(featuredProduct.price.amount, featuredProduct.price.currency)}</strong>
        </button>
      </figure>
    );
  }

  return (
    <figure className="fd-hero__media fd-hero__media--art">
      <HeroArt />
    </figure>
  );
}
