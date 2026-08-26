import { VARIANT_LIMITS } from './limits';
import type {
  CombinationPreview,
  DraftOption,
  DraftOptionValue,
  DraftVariant,
  VariantDraft,
} from './types';

export function newClientId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyVariantDraft(): VariantDraft {
  return {
    enabled: false,
    options: [],
    variants: [],
    permanentlyRemoveValueIds: [],
    missingAction: 'deactivate',
  };
}

export function emptyOption(position: number): DraftOption {
  return {
    clientId: newClientId('opt'),
    serverId: null,
    name: '',
    position,
    values: [],
  };
}

function pluralizeOptionName(name: string, count: number): string {
  const trimmed = name.trim() || 'option';
  if (count === 1) return trimmed;
  if (/s$/i.test(trimmed)) return trimmed;
  return `${trimmed}s`;
}

export function combinationCount(valueCounts: number[]): number {
  const positive = valueCounts.filter((c) => c > 0);
  if (positive.length === 0) return 0;
  return positive.reduce((acc, n) => acc * n, 1);
}

export function combinationPreview(options: DraftOption[]): CombinationPreview {
  const named = options
    .map((o) => ({
      name: o.name.trim() || 'Option',
      valueCount: o.values.length,
    }))
    .filter((o) => o.valueCount > 0);

  const count = combinationCount(named.map((o) => o.valueCount));
  const expression =
    named.length === 0 ? '0' : named.map((o) => String(o.valueCount)).join(' × ');
  const namesExpression =
    named.length === 0
      ? '0 variants'
      : named.map((o) => `${o.valueCount} ${pluralizeOptionName(o.name, o.valueCount)}`).join(' × ');

  return {
    count,
    expression,
    namesExpression,
    blocked: count > VARIANT_LIMITS.hardMaximum,
    warning: count >= VARIANT_LIMITS.softWarning && count <= VARIANT_LIMITS.hardMaximum,
  };
}

export function variantMergeKey(valueClientIds: string[]): string {
  return valueClientIds.join('\u0000');
}

/**
 * Deterministic identity for a combination. Sorted by option id so reordering
 * options does not rewrite keys. Matches `expand_product_variant_combinations`.
 */
export function buildOptionKey(pairs: { optionId: string; valueId: string }[]): string {
  return [...pairs]
    .sort((a, b) => a.optionId.localeCompare(b.optionId))
    .map((p) => `${p.optionId}:${p.valueId}`)
    .join('|');
}

export function cartesianRows(options: DraftOption[]): {
  key: string;
  label: string;
  valueClientIds: string[];
  values: DraftOptionValue[];
}[] {
  const active = options.filter((o) => o.values.length > 0);
  if (active.length === 0) return [];

  let tuples: DraftOptionValue[][] = [[]];
  for (const option of active) {
    tuples = tuples.flatMap((prefix) => option.values.map((value) => [...prefix, value]));
  }

  return tuples.map((values) => {
    const valueClientIds = values.map((v) => v.clientId);
    return {
      key: variantMergeKey(valueClientIds),
      label: values.map((v) => v.value).join(' / '),
      valueClientIds,
      values,
    };
  });
}

export function syncDraftVariants(draft: VariantDraft): VariantDraft {
  if (!draft.enabled) return draft;
  const rows = cartesianRows(draft.options);
  const previous = new Map(draft.variants.map((v) => [v.key, v]));

  const variants: DraftVariant[] = rows.map((row, position) => {
    const existing = previous.get(row.key);
    if (existing) {
      return {
        ...existing,
        key: row.key,
        label: row.label,
        valueClientIds: row.valueClientIds,
        position,
      };
    }
    return {
      key: row.key,
      serverId: null,
      optionKey: null,
      label: row.label,
      valueClientIds: row.valueClientIds,
      sku: '',
      priceOverride: '',
      stock: '0',
      active: true,
      position,
    };
  });

  return { ...draft, variants };
}

export function serializeVariantDraft(draft: VariantDraft): string {
  return JSON.stringify({
    enabled: draft.enabled,
    missingAction: draft.missingAction,
    permanentlyRemoveValueIds: [...draft.permanentlyRemoveValueIds].sort(),
    options: draft.options.map((o) => ({
      clientId: o.clientId,
      serverId: o.serverId,
      name: o.name,
      position: o.position,
      values: o.values.map((v) => ({
        clientId: v.clientId,
        serverId: v.serverId,
        value: v.value,
        position: v.position,
        swatchHex: v.swatchHex,
        imageIds: v.imageIds || [],
      })),
    })),
    variants: draft.variants.map((v) => ({
      key: v.key,
      serverId: v.serverId,
      sku: v.sku,
      priceOverride: v.priceOverride,
      stock: v.stock,
      active: v.active,
    })),
  });
}

export function variantsUsingValue(draft: VariantDraft, valueClientId: string): DraftVariant[] {
  return draft.variants.filter((v) => v.valueClientIds.includes(valueClientId));
}

export function variantsUsingOption(draft: VariantDraft, optionClientId: string): DraftVariant[] {
  const option = draft.options.find((o) => o.clientId === optionClientId);
  if (!option) return [];
  const ids = new Set(option.values.map((v) => v.clientId));
  return draft.variants.filter((v) => v.valueClientIds.some((id) => ids.has(id)));
}

export function activeVariantStockSum(draft: VariantDraft): number {
  if (!draft.enabled) return 0;
  return draft.variants.reduce((sum, v) => {
    if (!v.active) return sum;
    const n = parseInt(v.stock, 10);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

export function effectiveVariantPrice(priceOverride: string, basePrice: number): number | null {
  const trimmed = priceOverride.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function skuAbbrev(value: string): string {
  const u = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!u) return 'X';
  if (u.length <= 3) return u;
  const rest = u.slice(1).replace(/[AEIOU]/g, '');
  return (u[0] + rest).slice(0, 3) || u.slice(0, 3);
}

export function generateVariantSku(baseSku: string, label: string): string {
  const base = (baseSku || 'SKU').trim().toUpperCase().replace(/\s+/g, '') || 'SKU';
  const parts = label
    .split('/')
    .map((p) => skuAbbrev(p))
    .filter(Boolean);
  return [base, ...parts].join('-');
}

export function validateVariantDraft(draft: VariantDraft): { ok: true } | { ok: false; message: string } {
  if (!draft.enabled) return { ok: true };

  const names = draft.options.map((o) => o.name.trim()).filter(Boolean);
  if (draft.options.length > VARIANT_LIMITS.maxOptions) {
    return {
      ok: false,
      message: `A product can have at most ${VARIANT_LIMITS.maxOptions} options.`,
    };
  }

  const seen = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) {
      return { ok: false, message: `Option names must be unique. “${name}” is duplicated.` };
    }
    seen.add(key);
  }

  for (const option of draft.options) {
    const values = new Set<string>();
    for (const value of option.values) {
      const key = value.value.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!key) {
        return { ok: false, message: `Empty values are not allowed on “${option.name || 'Option'}”.` };
      }
      if (values.has(key)) {
        return {
          ok: false,
          message: `“${value.value}” is duplicated on ${option.name || 'this option'}.`,
        };
      }
      values.add(key);
    }
  }

  const preview = combinationPreview(draft.options);
  if (preview.blocked) {
    return {
      ok: false,
      message: `${preview.expression} = ${preview.count} combinations\n\nMaximum allowed: ${VARIANT_LIMITS.hardMaximum}`,
    };
  }

  for (const variant of draft.variants) {
    const stock = parseInt(variant.stock, 10);
    if (!Number.isFinite(stock) || stock < 0) {
      return { ok: false, message: `Stock for ${variant.label} must be 0 or more.` };
    }
    const override = variant.priceOverride.trim();
    if (override) {
      const n = Number(override);
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, message: `Price for ${variant.label} must be 0 or more.` };
      }
    }
  }

  return { ok: true };
}

export function toSavePayload(draft: VariantDraft) {
  return {
    has_variants: draft.enabled,
    missing_action: draft.missingAction,
    permanently_remove_value_ids: draft.permanentlyRemoveValueIds,
    options: draft.options
      .filter((o) => o.name.trim())
      .map((option, index) => ({
        id: option.serverId,
        client_id: option.clientId,
        name: option.name.trim(),
        position: index,
        values: option.values.map((value, valueIndex) => ({
          id: value.serverId,
          client_id: value.clientId,
          value: value.value.trim(),
          position: valueIndex,
          swatch_hex: value.swatchHex,
          image_ids: Array.isArray(value.imageIds) ? value.imageIds : [],
        })),
      })),
    variants: draft.variants.map((variant) => ({
      client_value_ids: variant.valueClientIds,
      sku: variant.sku.trim() || null,
      price_override: variant.priceOverride.trim() === '' ? null : Number(variant.priceOverride),
      stock: Math.max(0, parseInt(variant.stock, 10) || 0),
      active: variant.active,
    })),
  };
}
