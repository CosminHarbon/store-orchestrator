import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatRon } from '@/lib/paymentAnalytics';
import { cn } from '@/lib/utils';
import { differenceInDays, format, isAfter, isBefore, parseISO } from 'date-fns';

export type DiscountLifecycle = 'active' | 'scheduled' | 'expired';

export interface DiscountRow {
  id: string;
  name: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  product_count: number;
  status: DiscountLifecycle;
}

interface ProductOption {
  id: string;
  title: string;
  price: number;
  sku?: string | null;
}

interface DiscountEditorDrawerProps {
  discount: DiscountRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductOption[];
  assignedProductIds: string[];
  performance?: {
    revenue: number;
    orders: number;
    units: number;
  } | null;
  onSaved: () => void;
  onDeleted: (id: string) => void;
  onDuplicated: (id: string) => void;
}

type FormState = {
  name: string;
  description: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

export function deriveDiscountStatus(
  d: Pick<DiscountRow, 'start_date' | 'end_date' | 'is_active'>
): DiscountLifecycle {
  const now = new Date();
  const start = parseISO(d.start_date);
  const end = d.end_date ? parseISO(d.end_date) : null;

  if (end && isAfter(now, end)) return 'expired';
  if (isBefore(now, start)) return 'scheduled';
  if (!d.is_active) return 'expired';
  return 'active';
}

export function statusBadgeClass(status: DiscountLifecycle) {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800 border-0';
    case 'scheduled':
      return 'bg-sky-100 text-sky-800 border-0';
    case 'expired':
      return 'bg-slate-100 text-slate-700 border-0';
  }
}

export function DiscountEditorDrawer({
  discount,
  open,
  onOpenChange,
  products,
  assignedProductIds,
  performance,
  onSaved,
  onDeleted,
  onDuplicated,
}: DiscountEditorDrawerProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<FormState | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [baselineIds, setBaselineIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!discount || !open) return;
    const next: FormState = {
      name: discount.name || '',
      description: discount.description || '',
      discount_type: discount.discount_type,
      discount_value: String(discount.discount_value ?? ''),
      start_date: new Date(discount.start_date).toISOString().split('T')[0],
      end_date: discount.end_date
        ? new Date(discount.end_date).toISOString().split('T')[0]
        : '',
      is_active: discount.is_active,
    };
    setForm(next);
    setBaseline(next);
    setSelectedIds([...assignedProductIds]);
    setBaselineIds([...assignedProductIds]);
    setProductSearch('');
    setPickerSelection(new Set());
  }, [discount?.id, open, assignedProductIds.join(',')]);

  const dirtyForm =
    !!form &&
    !!baseline &&
    (form.name !== baseline.name ||
      form.description !== baseline.description ||
      form.discount_type !== baseline.discount_type ||
      form.discount_value !== baseline.discount_value ||
      form.start_date !== baseline.start_date ||
      form.end_date !== baseline.end_date ||
      form.is_active !== baseline.is_active);
  const dirtyProducts =
    selectedIds.slice().sort().join(',') !== baselineIds.slice().sort().join(',');
  const isDirty = dirtyForm || dirtyProducts;

  const liveStatus = useMemo(() => {
    if (!form) return 'active' as DiscountLifecycle;
    return deriveDiscountStatus({
      start_date: new Date(form.start_date).toISOString(),
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      is_active: form.is_active,
    });
  }, [form]);

  const expiryCountdown = useMemo(() => {
    if (!form?.end_date) return null;
    const end = parseISO(form.end_date);
    const days = differenceInDays(end, new Date());
    if (days < 0) return 'Expired';
    if (days === 0) return 'Ends today';
    return `${days} day${days === 1 ? '' : 's'} until expiry`;
  }, [form?.end_date]);

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
        (p.sku || '').toLowerCase().includes(q)
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
    if (!discount || !form) return;
    if (!form.name.trim()) {
      toast.error('Discount name is required');
      return;
    }
    const value = parseFloat(form.discount_value);
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Enter a valid discount value');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('discounts')
        .update({
          name: form.name.trim(),
          description: form.description,
          discount_type: form.discount_type,
          discount_value: value,
          start_date: new Date(form.start_date).toISOString(),
          end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
          is_active: form.is_active,
        })
        .eq('id', discount.id);
      if (error) throw error;

      await supabase.from('product_discounts').delete().eq('discount_id', discount.id);
      if (selectedIds.length > 0) {
        const { error: pdErr } = await supabase.from('product_discounts').insert(
          selectedIds.map((product_id) => ({
            product_id,
            discount_id: discount.id,
          }))
        );
        if (pdErr) throw pdErr;
      }

      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      queryClient.invalidateQueries({ queryKey: ['product-discounts'] });
      setBaseline({ ...form, name: form.name.trim(), discount_value: String(value) });
      setBaselineIds([...selectedIds]);
      toast.success('Discount saved');
      onSaved();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save discount');
    } finally {
      setSaving(false);
    }
  };

  if (!discount || !form) {
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
              <SheetTitle className="truncate flex items-center gap-2">
                {form.name || 'Discount'}
                <Badge className={statusBadgeClass(liveStatus)}>
                  {liveStatus.charAt(0).toUpperCase() + liveStatus.slice(1)}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                {selectedIds.length} products
                {isDirty ? ' · Unsaved changes' : ''}
              </SheetDescription>
            </SheetHeader>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title="Duplicate"
              onClick={() => onDuplicated(discount.id)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
          <Tabs defaultValue="general">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              {performance && <TabsTrigger value="performance">Performance</TabsTrigger>}
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Discount name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={form.discount_type}
                    onValueChange={(v: 'percentage' | 'fixed_amount') =>
                      setForm({ ...form, discount_type: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed_amount">Fixed amount (RON)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    {form.discount_type === 'percentage' ? 'Percentage' : 'Amount (RON)'}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={form.discount_type === 'percentage' ? '100' : undefined}
                    value={form.discount_value}
                    onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="min-h-[100px]"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, is_active: checked === true })
                  }
                />
                Mark as active (when within schedule)
              </label>
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
                          {formatRon(Number(p.price))}
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
                    placeholder="Search products…"
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
                          {formatRon(Number(p.price))}
                        </div>
                      </div>
                    </label>
                  ))}
                  {!searchableProducts.length && (
                    <p className="p-3 text-sm text-muted-foreground">No matching products to add.</p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="schedule" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End date</Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Current status</span>
                  <Badge className={statusBadgeClass(liveStatus)}>
                    {liveStatus.charAt(0).toUpperCase() + liveStatus.slice(1)}
                  </Badge>
                </div>
                {expiryCountdown && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Countdown</span>
                    <span className="font-medium">{expiryCountdown}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Starts</span>
                  <span>
                    {form.start_date
                      ? format(parseISO(form.start_date), 'MMM d, yyyy')
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Ends</span>
                  <span>
                    {form.end_date
                      ? format(parseISO(form.end_date), 'MMM d, yyyy')
                      : 'No end date'}
                  </span>
                </div>
              </div>
            </TabsContent>

            {performance && (
              <TabsContent value="performance" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Products on discount" value={String(selectedIds.length)} />
                  <Stat label="Units sold" value={String(performance.units)} />
                  <Stat label="Orders (est.)" value={String(performance.orders)} />
                  <Stat label="Revenue (est.)" value={formatRon(performance.revenue)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Estimates are based on order items for products currently assigned to this
                  discount.
                </p>
              </TabsContent>
            )}
          </Tabs>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onDuplicated(discount.id)}
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!confirm(`Delete "${discount.name}"?`)) return;
                onDeleted(discount.id);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
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
