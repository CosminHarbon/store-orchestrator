// PROTECTED: variant selection. Cursor may not edit this file.
import type { ProductVariant } from '../types';

export interface VariantSelectorProps {
  variants: ProductVariant[];
  value: string | null;
  onChange: (variantId: string) => void;
  label?: string;
}

export default function VariantSelector({
  variants,
  value,
  onChange,
  label = 'Size',
}: VariantSelectorProps) {
  if (variants.length === 0) return null;

  return (
    <div className="sf-variants" role="radiogroup" aria-label={label}>
      {variants.map((v) => (
        <button
          key={v.id}
          type="button"
          role="radio"
          aria-checked={value === v.id}
          disabled={!v.inStock}
          className={value === v.id ? 'is-active' : ''}
          onClick={() => onChange(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
