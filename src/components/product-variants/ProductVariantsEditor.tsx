import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  GripVertical,
  Layers,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { VARIANT_LIMITS } from '@/lib/productVariants/limits';
import { formatLei } from '@/lib/productVariants/display';
import {
  activeVariantStockSum,
  combinationPreview,
  emptyOption,
  generateVariantSku,
  syncDraftVariants,
  variantsUsingOption,
  variantsUsingValue,
} from '@/lib/productVariants/cartesian';
import type { DraftOption, VariantDraft } from '@/lib/productVariants/types';
import {
  OptionValueImageDialog,
  OptionValueImageTrigger,
} from './OptionValueImageDialog';

const OPTION_NAME_PLACEHOLDERS = ['Size', 'Colour', 'Material', 'Storage'];

type PendingRemoval =
  | { kind: 'value'; optionClientId: string; valueClientId: string; label: string; count: number }
  | { kind: 'option'; optionClientId: string; label: string; count: number };

interface ProductVariantsEditorProps {
  draft: VariantDraft;
  onChange: (next: VariantDraft) => void;
  basePrice: number;
  baseSku: string;
  productImages?: { id: string; image_url: string }[];
}

export function ProductVariantsEditor({
  draft,
  onChange,
  basePrice,
  baseSku,
  productImages = [],
}: ProductVariantsEditorProps) {
  const { t } = useTranslation('products');
  const [valueInputs, setValueInputs] = useState<Record<string, string>>({});
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkStock, setBulkStock] = useState('');
  const [bulkAdjust, setBulkAdjust] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [imageTarget, setImageTarget] = useState<{
    optionClientId: string;
    valueClientId: string;
    label: string;
  } | null>(null);

  const preview = useMemo(() => combinationPreview(draft.options), [draft.options]);
  const stockSum = useMemo(() => activeVariantStockSum(draft), [draft]);

  const commit = (next: VariantDraft) => onChange(syncDraftVariants(next));

  const enableVariants = (enabled: boolean) => {
    if (!enabled) {
      commit({ ...draft, enabled: false });
      return;
    }
    const options = draft.options.length > 0 ? draft.options : [emptyOption(0)];
    commit({ ...draft, enabled: true, options });
  };

  const updateOption = (clientId: string, patch: Partial<DraftOption>) => {
    commit({
      ...draft,
      options: draft.options.map((o) => (o.clientId === clientId ? { ...o, ...patch } : o)),
    });
  };

  const addOption = () => {
    if (draft.options.length >= VARIANT_LIMITS.maxOptions) return;
    commit({
      ...draft,
      options: [...draft.options, emptyOption(draft.options.length)],
    });
  };

  const parseValues = (raw: string): string[] => {
    return raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  };

  const addValues = (option: DraftOption, raw: string) => {
    const incoming = parseValues(raw);
    if (!incoming.length) return;
    const existing = new Set(option.values.map((v) => v.value.toLowerCase().replace(/\s+/g, ' ')));
    const nextValues = [...option.values];
    for (const value of incoming) {
      const key = value.toLowerCase().replace(/\s+/g, ' ');
      if (existing.has(key)) continue;
      existing.add(key);
      nextValues.push({
        clientId: crypto.randomUUID(),
        serverId: null,
        value,
        position: nextValues.length,
        swatchHex: null,
        imageIds: [],
      });
    }
    updateOption(option.clientId, { values: nextValues });
    setValueInputs((prev) => ({ ...prev, [option.clientId]: '' }));
  };

  const requestRemoveValue = (option: DraftOption, valueClientId: string) => {
    const value = option.values.find((v) => v.clientId === valueClientId);
    if (!value) return;
    const affected = variantsUsingValue(draft, valueClientId).filter((v) => v.serverId);
    if (affected.length === 0) {
      applyRemoveValue(option.clientId, valueClientId, 'deactivate');
      return;
    }
    setPendingRemoval({
      kind: 'value',
      optionClientId: option.clientId,
      valueClientId,
      label: value.value,
      count: affected.length,
    });
  };

  const requestRemoveOption = (option: DraftOption) => {
    const affected = variantsUsingOption(draft, option.clientId).filter((v) => v.serverId);
    if (affected.length === 0) {
      applyRemoveOption(option.clientId, 'deactivate');
      return;
    }
    setPendingRemoval({
      kind: 'option',
      optionClientId: option.clientId,
      label: option.name || 'this option',
      count: affected.length,
    });
  };

  const applyRemoveValue = (
    optionClientId: string,
    valueClientId: string,
    action: 'deactivate' | 'delete'
  ) => {
    const option = draft.options.find((o) => o.clientId === optionClientId);
    const value = option?.values.find((v) => v.clientId === valueClientId);
    const permanentlyRemoveValueIds = [...draft.permanentlyRemoveValueIds];
    if (action === 'delete' && value?.serverId) {
      permanentlyRemoveValueIds.push(value.serverId);
    }
    commit({
      ...draft,
      missingAction: action === 'delete' ? draft.missingAction : 'deactivate',
      permanentlyRemoveValueIds,
      options: draft.options.map((o) =>
        o.clientId === optionClientId
          ? { ...o, values: o.values.filter((v) => v.clientId !== valueClientId) }
          : o
      ),
    });
  };

  const applyRemoveOption = (optionClientId: string, action: 'deactivate' | 'delete') => {
    const option = draft.options.find((o) => o.clientId === optionClientId);
    const permanentlyRemoveValueIds = [...draft.permanentlyRemoveValueIds];
    if (action === 'delete' && option) {
      for (const value of option.values) {
        if (value.serverId) permanentlyRemoveValueIds.push(value.serverId);
      }
    }
    commit({
      ...draft,
      missingAction: action === 'delete' ? draft.missingAction : 'deactivate',
      permanentlyRemoveValueIds,
      options: draft.options
        .filter((o) => o.clientId !== optionClientId)
        .map((o, i) => ({ ...o, position: i })),
    });
  };

  const confirmRemoval = (action: 'deactivate' | 'delete') => {
    if (!pendingRemoval) return;
    if (pendingRemoval.kind === 'value') {
      applyRemoveValue(pendingRemoval.optionClientId, pendingRemoval.valueClientId, action);
    } else {
      applyRemoveOption(pendingRemoval.optionClientId, action);
    }
    setPendingRemoval(null);
  };

  const updateValueImages = (optionClientId: string, valueClientId: string, imageIds: string[]) => {
    commit({
      ...draft,
      options: draft.options.map((option) =>
        option.clientId === optionClientId
          ? {
              ...option,
              values: option.values.map((value) =>
                value.clientId === valueClientId ? { ...value, imageIds } : value
              ),
            }
          : option
      ),
    });
  };

  const imageTargetValue = imageTarget
    ? draft.options
        .find((option) => option.clientId === imageTarget.optionClientId)
        ?.values.find((value) => value.clientId === imageTarget.valueClientId)
    : null;

  const moveValue = (option: DraftOption, valueClientId: string, dir: -1 | 1) => {
    const index = option.values.findIndex((v) => v.clientId === valueClientId);
    const nextIndex = index + dir;
    if (index < 0 || nextIndex < 0 || nextIndex >= option.values.length) return;
    const values = [...option.values];
    const [item] = values.splice(index, 1);
    values.splice(nextIndex, 0, item);
    updateOption(option.clientId, {
      values: values.map((v, i) => ({ ...v, position: i })),
    });
  };

  const updateVariant = (key: string, patch: Partial<VariantDraft['variants'][number]>) => {
    commit({
      ...draft,
      variants: draft.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)),
    });
  };

  const selectedVariants = draft.variants.filter((v) => selectedKeys.has(v.key));

  const applyBulk = (mutator: (v: VariantDraft['variants'][number]) => VariantDraft['variants'][number]) => {
    if (!selectedKeys.size) return;
    commit({
      ...draft,
      variants: draft.variants.map((v) => (selectedKeys.has(v.key) ? mutator(v) : v)),
    });
  };

  const generateSkus = (onlySelected: boolean) => {
    commit({
      ...draft,
      variants: draft.variants.map((v) => {
        if (onlySelected && !selectedKeys.has(v.key)) return v;
        return { ...v, sku: generateVariantSku(baseSku, v.label) };
      }),
    });
  };

  if (!draft.enabled) {
    return (
      <div className="rounded-xl border bg-gradient-to-br from-background to-muted/30 p-8">
        <div className="mx-auto max-w-lg text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Layers className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Variants</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sell this product in different options such as size, colour, material or version.
            </p>
          </div>
          <label className="inline-flex items-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm font-medium cursor-pointer hover:bg-muted/40">
            <Switch checked={false} onCheckedChange={enableVariants} />
            This product has variants
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3">
        <label className="inline-flex items-center gap-3 text-sm font-medium cursor-pointer">
          <Switch checked onCheckedChange={enableVariants} />
          This product has variants
        </label>
        <p className="text-xs text-muted-foreground">
          Price, stock, SKU and availability are set per combination below.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Options
          </h3>
          <Badge variant="outline" className="tabular-nums font-normal">
            {draft.options.length}/{VARIANT_LIMITS.maxOptions}
          </Badge>
        </div>

        <div className="space-y-3">
          {draft.options.map((option, index) => (
            <div key={option.clientId} className="rounded-xl border bg-background p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Option {index + 1}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground"
                  onClick={() => requestRemoveOption(option)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={option.name}
                  placeholder={OPTION_NAME_PLACEHOLDERS[index] || 'Version'}
                  onChange={(e) => updateOption(option.clientId, { name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Values</Label>
                <div className="space-y-1.5">
                  {option.values.map((value, valueIndex) => (
                    <div
                      key={value.clientId}
                      className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-2 py-1.5"
                    >
                      {option.values.length > 1 && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          title="Move earlier"
                          onClick={() => moveValue(option, value.clientId, -1)}
                          disabled={valueIndex === 0}
                        >
                          <GripVertical className="h-3 w-3" />
                        </button>
                      )}
                      {value.swatchHex ? (
                        <span
                          className="h-3.5 w-3.5 rounded-full border shrink-0"
                          style={{ backgroundColor: value.swatchHex }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <span className="text-sm font-medium">{value.value}</span>
                      <OptionValueImageTrigger
                        count={value.imageIds.length}
                        thumbs={value.imageIds
                          .map((id) => productImages.find((image) => image.id === id)?.image_url)
                          .filter((src): src is string => Boolean(src))}
                        onClick={() =>
                          setImageTarget({
                            optionClientId: option.clientId,
                            valueClientId: value.clientId,
                            label: value.value,
                          })
                        }
                      />
                      <button
                        type="button"
                        className="ml-auto h-6 w-6 inline-flex items-center justify-center rounded-full hover:bg-muted"
                        onClick={() => requestRemoveValue(option, value.clientId)}
                        aria-label={`Remove ${value.value}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <Input
                  value={valueInputs[option.clientId] || ''}
                  placeholder="Add a value and press Enter"
                  onChange={(e) =>
                    setValueInputs((prev) => ({ ...prev, [option.clientId]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addValues(option, valueInputs[option.clientId] || '');
                    }
                  }}
                  onBlur={() => {
                    const raw = valueInputs[option.clientId];
                    if (raw?.includes(',')) addValues(option, raw);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Press Enter to add. You can also paste several values separated by commas.
                </p>
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addOption}
          disabled={draft.options.length >= VARIANT_LIMITS.maxOptions}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add another option
        </Button>
      </section>

      <div
        className={cn(
          'rounded-xl border px-4 py-3 text-sm',
          preview.blocked
            ? 'border-destructive/40 bg-destructive/5 text-destructive'
            : preview.warning
              ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
              : 'bg-muted/20'
        )}
      >
        {preview.count === 0 ? (
          <p>Add option values to generate combinations.</p>
        ) : (
          <div className="space-y-1">
            <p className="font-medium">
              {preview.count} variant{preview.count === 1 ? '' : 's'} will be generated
            </p>
            <p className={cn('text-muted-foreground', preview.blocked && 'text-destructive')}>
              {preview.namesExpression} = {preview.count}
              {preview.blocked
                ? ` · Maximum allowed: ${VARIANT_LIMITS.hardMaximum}`
                : preview.warning
                  ? ` · Large catalogues slow down checkout. Maximum is ${VARIANT_LIMITS.hardMaximum}.`
                  : ''}
            </p>
            {preview.blocked && (
              <p className="flex items-center gap-1.5 pt-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {preview.expression} = {preview.count} combinations. Reduce an option to save.
              </p>
            )}
          </div>
        )}
      </div>

      {draft.variants.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                Combinations
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Empty price inherits the product price ({formatLei(basePrice)}). Active stock total:{' '}
                <span className="tabular-nums font-medium text-foreground">{stockSum}</span>
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => generateSkus(false)}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Generate SKUs
            </Button>
          </div>

          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto -mx-1 px-1">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          draft.variants.length > 0 &&
                          selectedKeys.size === draft.variants.length
                        }
                        onCheckedChange={(checked) => {
                          setSelectedKeys(
                            checked ? new Set(draft.variants.map((v) => v.key)) : new Set()
                          );
                        }}
                        aria-label="Select all variants"
                      />
                    </TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draft.variants.map((variant) => (
                    <TableRow key={variant.key} className={cn(!variant.active && 'opacity-60')}>
                      <TableCell>
                        <Checkbox
                          checked={selectedKeys.has(variant.key)}
                          onCheckedChange={(checked) => {
                            setSelectedKeys((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(variant.key);
                              else next.delete(variant.key);
                              return next;
                            });
                          }}
                          aria-label={`Select ${variant.label}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-[10rem] sm:max-w-[16rem] whitespace-normal break-words">
                        {variant.label}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="h-8 w-32 ml-auto text-right"
                          inputMode="decimal"
                          placeholder={`Base · ${formatLei(basePrice)}`}
                          value={variant.priceOverride}
                          onChange={(e) =>
                            updateVariant(variant.key, { priceOverride: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="h-8 w-20 ml-auto text-right tabular-nums"
                          inputMode="numeric"
                          value={variant.stock}
                          onChange={(e) =>
                            updateVariant(variant.key, {
                              stock: e.target.value.replace(/[^\d]/g, ''),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 min-w-[8rem] font-mono text-xs"
                          placeholder={t('field.variantSkuHint')}
                          value={variant.sku}
                          onChange={(e) => updateVariant(variant.key, { sku: e.target.value })}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={variant.active}
                          onCheckedChange={(checked) =>
                            updateVariant(variant.key, { active: Boolean(checked) })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {selectedVariants.length > 0 && (
              <div className="border-t bg-muted/30 px-3 py-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium mr-1">
                  {selectedVariants.length} selected
                </span>
                <Input
                  className="h-8 w-28"
                  placeholder="Set price"
                  value={bulkPrice}
                  onChange={(e) => setBulkPrice(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    applyBulk((v) => ({ ...v, priceOverride: bulkPrice }));
                    setBulkPrice('');
                  }}
                >
                  Set price
                </Button>
                <Input
                  className="h-8 w-24"
                  placeholder="Set stock"
                  value={bulkStock}
                  onChange={(e) => setBulkStock(e.target.value.replace(/[^\d]/g, ''))}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    applyBulk((v) => ({ ...v, stock: bulkStock || '0' }));
                    setBulkStock('');
                  }}
                >
                  Set stock
                </Button>
                <Input
                  className="h-8 w-20"
                  placeholder="+/-"
                  value={bulkAdjust}
                  onChange={(e) => setBulkAdjust(e.target.value.replace(/[^\d-]/g, ''))}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const delta = parseInt(bulkAdjust, 10);
                    if (!Number.isFinite(delta)) return;
                    applyBulk((v) => ({
                      ...v,
                      stock: String(Math.max(0, (parseInt(v.stock, 10) || 0) + delta)),
                    }));
                    setBulkAdjust('');
                  }}
                >
                  Adjust stock
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => applyBulk((v) => ({ ...v, active: true }))}
                >
                  Enable
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => applyBulk((v) => ({ ...v, active: false }))}
                >
                  Disable
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => generateSkus(true)}>
                  Generate SKUs
                </Button>
              </div>
            )}
          </div>
        </section>
      )}

      <OptionValueImageDialog
        open={Boolean(imageTarget)}
        valueLabel={imageTarget?.label || ''}
        images={productImages}
        selectedIds={imageTargetValue?.imageIds || []}
        onChange={(imageIds) => {
          if (!imageTarget) return;
          updateValueImages(imageTarget.optionClientId, imageTarget.valueClientId, imageIds);
        }}
        onClose={() => {
          setImageTarget(null);
          document.body.style.removeProperty('pointer-events');
        }}
      />

      <Dialog open={!!pendingRemoval} onOpenChange={(open) => !open && setPendingRemoval(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {pendingRemoval?.label}?</DialogTitle>
            <DialogDescription>
              {pendingRemoval
                ? `${pendingRemoval.count} saved variant${pendingRemoval.count === 1 ? '' : 's'} use this ${pendingRemoval.kind}. Historical orders should keep those combinations. Deactivating is the safe default.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingRemoval(null)}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={() => confirmRemoval('deactivate')}>
              Deactivate affected variants
            </Button>
            <Button type="button" variant="destructive" onClick={() => confirmRemoval('delete')}>
              Permanently remove {pendingRemoval?.count ?? 0} variants
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
