import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { cn } from '@/lib/utils';
import type { StorefrontProduct, StorefrontVariant } from '@/lib/storefront/types';
import {
  addToCartCta,
  displayedSku,
  displayedStock,
  findVariantBySelection,
  firstMissingOption,
  initialVariantSelection,
  isPurchasableVariant,
  isVariantMatrixPending,
  nextVariantSelection,
  selectionIsComplete,
  type StockDisplay,
  type VariantCta,
  type VariantSelection,
  valueAvailability,
  variantTitle,
} from '@/lib/storefront/variantSelection';

export type VariantSelectorTone = 'premium' | 'floral' | 'elementar';

export function variantCtaLabel(t: TFunction, cta: VariantCta): string {
  switch (cta.kind) {
    case 'loading':
      return t('storefront:variants.loading');
    case 'select_option':
      return t('storefront:variants.selectOption', { name: cta.optionName });
    case 'choose_options':
      return t('storefront:variants.chooseOptions');
    case 'unavailable':
      return t('storefront:variants.unavailable');
    case 'out_of_stock':
      return t('storefront:variants.outOfStock');
    case 'add_to_cart':
    default:
      return t('storefront:variants.addToCart');
  }
}

export function variantStockLabel(t: TFunction, stock: StockDisplay): string {
  switch (stock.kind) {
    case 'loading':
      return t('storefront:variants.loading');
    case 'choose_options':
      return t('storefront:variants.chooseOptions');
    case 'out_of_stock':
      return t('storefront:variants.outOfStock');
    case 'in_stock':
      return t('storefront:variants.inStock');
    case 'only_left':
      return t('storefront:variants.onlyLeft', { count: stock.count });
    case 'in_stock_count':
      return t('storefront:variants.inStockCount', { count: stock.count });
    default:
      return t('storefront:variants.chooseOptions');
  }
}

export function useVariantSelection(product: StorefrontProduct | null) {
  const { t } = useTranslation('storefront');
  const matrixPending = isVariantMatrixPending(product);
  const options = product?.options ?? [];
  const variants = product?.variants ?? [];
  const [selection, setSelection] = useState<VariantSelection>(() =>
    initialVariantSelection(options)
  );

  const optionSignature = (product?.options ?? [])
    .map((option) => `${option.id}:${option.values.map((value) => value.id).join(',')}`)
    .join('|');

  useEffect(() => {
    setSelection(initialVariantSelection(product?.options ?? []));
  }, [product?.id, optionSignature]);

  const complete = selectionIsComplete(options, selection);
  const variant = complete ? findVariantBySelection(variants, selection) : null;
  const missing = firstMissingOption(options, selection);
  const cta = product?.has_variants
    ? addToCartCta(options, selection, variant, { matrixPending })
    : {
        disabled: (product?.stock ?? 0) <= 0,
        kind: ((product?.stock ?? 0) <= 0 ? 'out_of_stock' : 'add_to_cart') as VariantCta['kind'],
      };
  const stock = displayedStock(product ?? { stock: 0 }, variant, product?.has_variants ? complete : true, {
    matrixPending,
  });

  const selectValue = (optionId: string, valueId: string) => {
    setSelection((prev) => nextVariantSelection(options, variants, prev, optionId, valueId));
  };

  return {
    options,
    variants,
    selection,
    selectValue,
    complete,
    variant,
    missing,
    matrixPending,
    cta,
    ctaLabel: variantCtaLabel(t, cta),
    stock,
    stockLabel: variantStockLabel(t, stock),
    purchasable: Boolean(variant && isPurchasableVariant(variant)),
  };
}

interface VariantSelectorProps {
  product: StorefrontProduct;
  selection: VariantSelection;
  onSelect: (optionId: string, valueId: string) => void;
  resolvedVariant: StorefrontVariant | null;
  tone?: VariantSelectorTone;
  className?: string;
}

const toneClass: Record<
  VariantSelectorTone,
  {
    wrap: string;
    label: string;
    chip: string;
    chipOn: string;
    chipOff: string;
    hint: string;
  }
> = {
  premium: {
    wrap: 'space-y-4',
    label: 'text-xs uppercase tracking-wide text-[var(--prem-muted)]',
    chip: 'rounded-full border px-3 py-1.5 text-sm transition-colors',
    chipOn: 'border-[var(--prem-ink)] bg-[var(--prem-ink)] text-white',
    chipOff: 'border-[var(--prem-line)] hover:border-[var(--prem-ink)]',
    hint: 'text-xs text-[var(--prem-muted)]',
  },
  floral: {
    wrap: 'space-y-4',
    label: 'text-xs uppercase tracking-[0.16em] text-[var(--floral-muted)]',
    chip: 'border px-3 py-1.5 text-sm transition-colors',
    chipOn: 'border-[var(--floral-ink)] bg-[var(--floral-ink)] text-white',
    chipOff: 'border-[var(--floral-line)] hover:border-[var(--floral-ink)]',
    hint: 'text-xs text-[var(--floral-muted)]',
  },
  elementar: {
    wrap: 'space-y-4',
    label: 'text-xs uppercase tracking-wide opacity-70',
    chip: 'rounded-md border px-3 py-1.5 text-sm transition-colors',
    chipOn: 'border-current ring-2 ring-current font-semibold',
    chipOff: 'border-current/30 hover:border-current',
    hint: 'text-xs opacity-70',
  },
};

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-current';

export function VariantSelector({
  product,
  selection,
  onSelect,
  resolvedVariant,
  tone = 'premium',
  className,
}: VariantSelectorProps) {
  const { t } = useTranslation('storefront');
  const styles = toneClass[tone];
  const options = product.options ?? [];
  const variants = product.variants ?? [];

  if (product.has_variants && product.options == null) {
    return (
      <p className={cn(styles.hint, className)} aria-busy="true">
        {t('variants.loading')}
      </p>
    );
  }

  if (!product.has_variants || options.length === 0) return null;

  return (
    <div className={cn(styles.wrap, 'max-w-full', className)}>
      {options.map((option) => (
        <div key={option.id} className="space-y-2 min-w-0">
          <p className={styles.label}>{option.name}</p>
          <div className="flex flex-wrap gap-2 max-w-full">
            {option.values.map((value) => {
              const availability = valueAvailability(
                variants,
                selection,
                option.id,
                value.id
              );
              const selected = selection[option.id] === value.id;
              const disabled = availability !== 'available' && !selected;
              const availabilityLabel =
                availability === 'out_of_stock'
                  ? t('variants.outOfStock')
                  : availability === 'unavailable'
                    ? t('variants.unavailable')
                    : '';
              return (
                <button
                  key={value.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(option.id, value.id)}
                  title={availabilityLabel || value.value}
                  className={cn(
                    styles.chip,
                    focusRing,
                    selected ? styles.chipOn : styles.chipOff,
                    disabled && 'opacity-40 line-through cursor-not-allowed'
                  )}
                  aria-pressed={selected}
                  aria-disabled={disabled}
                  aria-label={
                    availabilityLabel
                      ? `${option.name}: ${value.value} (${availabilityLabel})`
                      : `${option.name}: ${value.value}`
                  }
                >
                  {value.swatch_hex ? (
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full border border-black/10 shrink-0"
                        style={{ backgroundColor: value.swatch_hex }}
                        aria-hidden="true"
                      />
                      {value.value}
                    </span>
                  ) : (
                    value.value
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <VariantStatus
        product={product}
        resolvedVariant={resolvedVariant}
        complete={options.every((option) => Boolean(selection[option.id]))}
        className={styles.hint}
      />
    </div>
  );
}

function VariantStatus({
  product,
  resolvedVariant,
  complete,
  className,
}: {
  product: StorefrontProduct;
  resolvedVariant: StorefrontVariant | null;
  complete: boolean;
  className?: string;
}) {
  const { t } = useTranslation('storefront');
  const sku = displayedSku(product.sku, resolvedVariant);
  const stock = displayedStock(product, resolvedVariant, complete, {
    matrixPending: isVariantMatrixPending(product),
  });
  const stockLabel = variantStockLabel(t, stock);
  const title =
    resolvedVariant && product.options
      ? variantTitle(product.options, resolvedVariant)
      : '';

  return (
    <div className={cn('space-y-1', className)}>
      {sku ? <p>{t('variants.sku', { sku })}</p> : null}
      <p>
        {complete && title ? `${title} · ${stockLabel}` : stockLabel}
      </p>
    </div>
  );
}

export { displayedSku, displayedStock };
