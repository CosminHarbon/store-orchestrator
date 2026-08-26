import type { VariantDraft } from './types';
import { emptyVariantDraft, syncDraftVariants, variantMergeKey } from './cartesian';

type OptionRow = {
  id: string;
  name: string;
  position: number;
  archived?: boolean;
};

type ValueRow = {
  id: string;
  option_id: string;
  value: string;
  position: number;
  swatch_hex: string | null;
  archived?: boolean;
};

type VariantRow = {
  id: string;
  option_key: string;
  sku: string | null;
  price_override: number | null;
  stock: number;
  active: boolean;
  position: number;
};

type MappingRow = {
  variant_id: string;
  option_id: string;
  option_value_id: string;
};

type ImageMappingRow = {
  option_value_id: string;
  image_id: string;
  position: number;
};

export function bundleToDraft(bundle: {
  hasVariants: boolean;
  options: OptionRow[];
  values: ValueRow[];
  variants: VariantRow[];
  mappings: MappingRow[];
  valueImages?: ImageMappingRow[];
}): VariantDraft {
  const imagesByValue = new Map<string, string[]>();
  for (const row of [...(bundle.valueImages || [])].sort((a, b) => a.position - b.position)) {
    const list = imagesByValue.get(row.option_value_id) || [];
    if (!list.includes(row.image_id)) list.push(row.image_id);
    imagesByValue.set(row.option_value_id, list);
  }

  const options = [...bundle.options]
    .filter((o) => !o.archived)
    .sort((a, b) => a.position - b.position)
    .map((option) => ({
      clientId: option.id,
      serverId: option.id,
      name: option.name,
      position: option.position,
      values: bundle.values
        .filter((v) => v.option_id === option.id && !v.archived)
        .sort((a, b) => a.position - b.position)
        .map((value) => ({
          clientId: value.id,
          serverId: value.id,
          value: value.value,
          position: value.position,
          swatchHex: value.swatch_hex,
          imageIds: imagesByValue.get(value.id) || [],
        })),
    }));

  const valueById = new Map(bundle.values.map((v) => [v.id, v]));
  const optionOrder = new Map(options.map((o, i) => [o.serverId, i]));

  const variants = [...bundle.variants]
    .sort((a, b) => a.position - b.position)
    .map((variant) => {
      const mappings = bundle.mappings
        .filter((m) => m.variant_id === variant.id)
        .sort(
          (a, b) =>
            (optionOrder.get(a.option_id) ?? 0) - (optionOrder.get(b.option_id) ?? 0)
        );
      const valueClientIds = mappings.map((m) => m.option_value_id);
      const label = mappings
        .map((m) => valueById.get(m.option_value_id)?.value)
        .filter(Boolean)
        .join(' / ');
      return {
        key: variantMergeKey(valueClientIds),
        serverId: variant.id,
        optionKey: variant.option_key,
        label,
        valueClientIds,
        sku: variant.sku || '',
        priceOverride:
          variant.price_override == null ? '' : String(variant.price_override),
        stock: String(variant.stock ?? 0),
        active: variant.active,
        position: variant.position,
      };
    });

  return syncDraftVariants({
    ...emptyVariantDraft(),
    enabled: bundle.hasVariants,
    options,
    variants,
  });
}
