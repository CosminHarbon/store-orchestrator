import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Folder, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import CollectionImageUpload from './CollectionImageUpload';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatRon } from '@/lib/paymentAnalytics';
import { cn } from '@/lib/utils';

export interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  product_count: number;
  inventory_value: number;
  revenue: number;
}

interface ProductOption {
  id: string;
  title: string;
  sku: string | null;
  price: number;
  category: string | null;
}

interface CollectionEditorDrawerProps {
  collection: CollectionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductOption[];
  assignedProductIds: string[];
  bestSellers: { id: string; title: string; units: number; revenue: number }[];
  onSaved: () => void;
  onDeleted: (id: string) => void;
}

type FormState = {
  name: string;
  description: string;
  image_url: string;
};

export function CollectionEditorDrawer({
  collection,
  open,
  onOpenChange,
  products,
  assignedProductIds,
  bestSellers,
  onSaved,
  onDeleted,
}: CollectionEditorDrawerProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<FormState | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [baselineIds, setBaselineIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!collection || !open) return;
    const next = {
      name: collection.name || '',
      description: collection.description || '',
      image_url: collection.image_url || '',
    };
    setForm(next);
    setBaseline(next);
    setSelectedIds([...assignedProductIds]);
    setBaselineIds([...assignedProductIds]);
    setProductSearch('');
    setPickerSelection(new Set());
  }, [collection?.id, open, assignedProductIds.join(',')]);

  const dirtyForm =
    !!form &&
    !!baseline &&
    (form.name !== baseline.name ||
      form.description !== baseline.description ||
      form.image_url !== baseline.image_url);
  const dirtyProducts =
    selectedIds.slice().sort().join(',') !== baselineIds.slice().sort().join(',');
  const isDirty = dirtyForm || dirtyProducts;

  const assignedProducts = useMemo(
    () => products.filter((p) => selectedIds.includes(p.id)),
    [products, selectedIds]
  );

  const searchableProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedIds.includes(p.id)) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    });
  }, [products, selectedIds, productSearch]);

  const discard = () => {
    if (!baseline) return;
    setForm({ ...baseline });
    setSelectedIds([...baselineIds]);
    setPickerSelection(new Set());
  };

  const save = async () => {
    if (!collection || !form) return;
    if (!form.name.trim()) {
      toast.error('Collection name is required');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('collections')
        .update({
          name: form.name.trim(),
          description: form.description,
          image_url: form.image_url || null,
        })
        .eq('id', collection.id);
      if (error) throw error;

      const toAdd = selectedIds.filter((id) => !baselineIds.includes(id));
      const toRemove = baselineIds.filter((id) => !selectedIds.includes(id));

      if (toRemove.length) {
        const { error: remErr } = await supabase
          .from('product_collections')
          .delete()
          .eq('collection_id', collection.id)
          .in('product_id', toRemove);
        if (remErr) throw remErr;
      }
      if (toAdd.length) {
        const { error: addErr } = await supabase.from('product_collections').insert(
          toAdd.map((product_id) => ({
            product_id,
            collection_id: collection.id,
          }))
        );
        if (addErr) throw addErr;
      }

      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['collection-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-collections-map'] });
      setBaseline({ ...form, name: form.name.trim() });
      setBaselineIds([...selectedIds]);
      toast.success('Collection saved');
      onSaved();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save collection');
    } finally {
      setSaving(false);
    }
  };

  if (!collection || !form) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-3xl p-0 [&>button]:hidden" />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (o) {
          onOpenChange(true);
          return;
        }
        if (isDirty && !confirm('You have unsaved changes. Discard them?')) return;
        onOpenChange(false);
      }}
    >
      <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col gap-0 overflow-hidden [&>button]:hidden">
        <div className="border-b px-4 py-3 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <SheetHeader className="text-left space-y-1">
              <SheetTitle className="truncate">{form.name || 'Collection'}</SheetTitle>
              <SheetDescription>
                {selectedIds.length} products
                {isDirty ? ' · Unsaved changes' : ''}
              </SheetDescription>
            </SheetHeader>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
          <div className="flex gap-4 items-start">
            <div className="h-24 w-24 rounded-lg overflow-hidden bg-muted flex items-center justify-center border shrink-0">
              {form.image_url ? (
                <img src={form.image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <Folder className="h-8 w-8 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <CollectionImageUpload
                collectionId={collection.id}
                currentImageUrl={form.image_url}
                onImageChange={(url) => setForm({ ...form, image_url: url })}
                onImageRemove={() => setForm({ ...form, image_url: '' })}
              />
            </div>
          </div>

          <Tabs defaultValue="general">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Collection name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="min-h-[120px]"
                />
              </div>
            </TabsContent>

            <TabsContent value="products" className="space-y-4 mt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Assigned products ({assignedProducts.length})</Label>
                  {assignedProducts.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedIds([])}
                    >
                      Remove all
                    </Button>
                  )}
                </div>
                <div className="rounded-md border max-h-40 overflow-y-auto divide-y">
                  {assignedProducts.length === 0 && (
                    <p className="p-3 text-sm text-muted-foreground">No products assigned yet.</p>
                  )}
                  {assignedProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.sku || 'No SKU'} · {formatRon(Number(p.price))}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== p.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Add products</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-10"
                    placeholder="Search products by name, SKU, category…"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!pickerSelection.size}
                    onClick={() => {
                      setSelectedIds((ids) => [...new Set([...ids, ...pickerSelection])]);
                      setPickerSelection(new Set());
                    }}
                  >
                    Add selected ({pickerSelection.size})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPickerSelection(new Set(searchableProducts.slice(0, 50).map((p) => p.id)))
                    }
                  >
                    Select visible
                  </Button>
                </div>
                <div className="rounded-md border max-h-56 overflow-y-auto divide-y">
                  {searchableProducts.slice(0, 80).map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/30"
                    >
                      <Checkbox
                        checked={pickerSelection.has(p.id)}
                        onCheckedChange={(checked) => {
                          setPickerSelection((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(p.id);
                            else next.delete(p.id);
                            return next;
                          });
                        }}
                      />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.sku || 'No SKU'} · {formatRon(Number(p.price))}
                        </div>
                      </div>
                    </label>
                  ))}
                  {!searchableProducts.length && (
                    <p className="p-3 text-sm text-muted-foreground">
                      No matching products to add.
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="performance" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Product count" value={String(selectedIds.length)} />
                <Stat label="Revenue" value={formatRon(collection.revenue)} />
                <Stat label="Inventory value" value={formatRon(collection.inventory_value)} />
                <Stat
                  label="Updated"
                  value={new Date(collection.updated_at).toLocaleDateString()}
                />
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Best sellers in collection</h4>
                <div className="space-y-2">
                  {bestSellers.length === 0 && (
                    <p className="text-sm text-muted-foreground">No sales data yet.</p>
                  )}
                  {bestSellers.slice(0, 5).map((b) => (
                    <div key={b.id} className="flex justify-between text-sm gap-2">
                      <span className="truncate">{b.title}</span>
                      <span className="text-muted-foreground shrink-0">
                        {b.units} sold · {formatRon(b.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (!confirm(`Delete "${collection.name}"?`)) return;
              onDeleted(collection.id);
            }}
          >
            Delete collection
          </Button>
        </div>

        <div
          className={cn(
            'shrink-0 border-t bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3',
            isDirty ? 'opacity-100' : 'opacity-60'
          )}
        >
          <p className="text-sm text-muted-foreground">
            {isDirty ? 'You have unsaved changes' : 'All changes saved'}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={!isDirty || saving} onClick={discard}>
              Discard
            </Button>
            <Button type="button" disabled={!isDirty || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium mt-0.5 break-words">{value}</div>
    </div>
  );
}
