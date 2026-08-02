import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Package,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { formatRon, type ProductMetrics } from '@/lib/productAnalytics';
import { cn } from '@/lib/utils';

export interface EditorProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string;
  category: string;
  stock: number;
  sku: string;
  low_stock_threshold: number;
}

interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  is_primary: boolean;
  display_order: number;
}

interface CollectionOption {
  id: string;
  name: string;
}

interface DiscountOption {
  id: string;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
}

interface ProductEditorDrawerProps {
  product: EditorProduct | null;
  products: EditorProduct[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (product: EditorProduct) => void;
  onDeleted: (id: string) => void;
  metrics?: ProductMetrics | null;
  collections: CollectionOption[];
  discounts: DiscountOption[];
}

type FormState = {
  title: string;
  sku: string;
  price: string;
  stock: string;
  low_stock_threshold: string;
  category: string;
  description: string;
};

function toForm(product: EditorProduct): FormState {
  return {
    title: product.title || '',
    sku: product.sku || '',
    price: String(product.price ?? ''),
    stock: String(product.stock ?? ''),
    low_stock_threshold: String(product.low_stock_threshold ?? 5),
    category: product.category || '',
    description: product.description || '',
  };
}

export function ProductEditorDrawer({
  product,
  products,
  open,
  onOpenChange,
  onNavigate,
  onDeleted,
  metrics,
  collections,
  discounts,
}: ProductEditorDrawerProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<FormState | null>(null);
  const [skuError, setSkuError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewDescription, setPreviewDescription] = useState(false);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [baselineCollections, setBaselineCollections] = useState<string[]>([]);
  const [selectedDiscountIds, setSelectedDiscountIds] = useState<string[]>([]);
  const [baselineDiscounts, setBaselineDiscounts] = useState<string[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [dragOverUpload, setDragOverUpload] = useState(false);
  const [dragImageId, setDragImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const index = useMemo(
    () => (product ? products.findIndex((p) => p.id === product.id) : -1),
    [product, products]
  );
  const prevProduct = index > 0 ? products[index - 1] : null;
  const nextProduct = index >= 0 && index < products.length - 1 ? products[index + 1] : null;

  const { data: images = [], isLoading: imagesLoading } = useQuery({
    queryKey: ['product-images', product?.id],
    enabled: !!product?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', product!.id)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return data as ProductImage[];
    },
  });

  const { data: productCollectionRows = [] } = useQuery({
    queryKey: ['product-collections', product?.id],
    enabled: !!product?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_collections')
        .select('collection_id')
        .eq('product_id', product!.id);
      if (error) throw error;
      return data as Array<{ collection_id: string }>;
    },
  });

  const { data: productDiscountRows = [] } = useQuery({
    queryKey: ['product-discounts', product?.id],
    enabled: !!product?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_discounts')
        .select('discount_id')
        .eq('product_id', product!.id);
      if (error) throw error;
      return data as Array<{ discount_id: string }>;
    },
  });

  useEffect(() => {
    if (!product || !open) return;
    const next = toForm(product);
    setForm(next);
    setBaseline(next);
    setSkuError(null);
    setPreviewDescription(false);
    setActiveImageId(null);
  }, [product?.id, open]);

  useEffect(() => {
    if (!open) return;
    const ids = productCollectionRows.map((r) => r.collection_id);
    setSelectedCollectionIds(ids);
    setBaselineCollections(ids);
  }, [productCollectionRows, open, product?.id]);

  useEffect(() => {
    if (!open) return;
    const ids = productDiscountRows.map((r) => r.discount_id);
    setSelectedDiscountIds(ids);
    setBaselineDiscounts(ids);
  }, [productDiscountRows, open, product?.id]);

  useEffect(() => {
    if (!images.length) {
      setActiveImageId(null);
      return;
    }
    if (!activeImageId || !images.some((i) => i.id === activeImageId)) {
      const primary = images.find((i) => i.is_primary) || images[0];
      setActiveImageId(primary.id);
    }
  }, [images, activeImageId]);

  const dirtyForm =
    !!form &&
    !!baseline &&
    (form.title !== baseline.title ||
      form.sku !== baseline.sku ||
      form.price !== baseline.price ||
      form.stock !== baseline.stock ||
      form.low_stock_threshold !== baseline.low_stock_threshold ||
      form.category !== baseline.category ||
      form.description !== baseline.description);

  const dirtyCollections =
    selectedCollectionIds.slice().sort().join(',') !==
    baselineCollections.slice().sort().join(',');
  const dirtyDiscounts =
    selectedDiscountIds.slice().sort().join(',') !==
    baselineDiscounts.slice().sort().join(',');
  const isDirty = dirtyForm || dirtyCollections || dirtyDiscounts;

  const activeImage =
    images.find((i) => i.id === activeImageId) ||
    images.find((i) => i.is_primary) ||
    images[0] ||
    null;

  const validateSku = async (sku: string, productId: string) => {
    const trimmed = sku.trim();
    if (!trimmed) {
      setSkuError('SKU is required');
      return false;
    }
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('sku', trimmed)
      .neq('id', productId)
      .limit(1);
    if (error) {
      console.error(error);
      setSkuError('Could not validate SKU uniqueness');
      return false;
    }
    if (data && data.length > 0) {
      setSkuError('This SKU is already used by another product');
      return false;
    }
    setSkuError(null);
    return true;
  };

  const discardChanges = () => {
    if (!baseline || !product) return;
    setForm({ ...baseline });
    setSelectedCollectionIds([...baselineCollections]);
    setSelectedDiscountIds([...baselineDiscounts]);
    setSkuError(null);
  };

  const saveChanges = async () => {
    if (!product || !form) return;
    const skuOk = await validateSku(form.sku, product.id);
    if (!skuOk) return;
    if (!form.title.trim()) {
      toast.error('Product name is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({
          title: form.title.trim(),
          sku: form.sku.trim(),
          price: parseFloat(form.price) || 0,
          stock: parseInt(form.stock, 10) || 0,
          low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 5,
          category: form.category.trim() || null,
          description: form.description,
        })
        .eq('id', product.id);
      if (error) throw error;

      // Sync collections
      const toAddCollections = selectedCollectionIds.filter(
        (id) => !baselineCollections.includes(id)
      );
      const toRemoveCollections = baselineCollections.filter(
        (id) => !selectedCollectionIds.includes(id)
      );
      if (toRemoveCollections.length) {
        await supabase
          .from('product_collections')
          .delete()
          .eq('product_id', product.id)
          .in('collection_id', toRemoveCollections);
      }
      if (toAddCollections.length) {
        await supabase.from('product_collections').insert(
          toAddCollections.map((collection_id) => ({
            product_id: product.id,
            collection_id,
          }))
        );
      }

      // Sync discounts
      const toAddDiscounts = selectedDiscountIds.filter(
        (id) => !baselineDiscounts.includes(id)
      );
      const toRemoveDiscounts = baselineDiscounts.filter(
        (id) => !selectedDiscountIds.includes(id)
      );
      if (toRemoveDiscounts.length) {
        await supabase
          .from('product_discounts')
          .delete()
          .eq('product_id', product.id)
          .in('discount_id', toRemoveDiscounts);
      }
      if (toAddDiscounts.length) {
        await supabase.from('product_discounts').insert(
          toAddDiscounts.map((discount_id) => ({
            product_id: product.id,
            discount_id,
          }))
        );
      }

      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-collections'] });
      queryClient.invalidateQueries({ queryKey: ['product-discounts'] });
      queryClient.invalidateQueries({ queryKey: ['product-collections-map'] });
      queryClient.invalidateQueries({ queryKey: ['product-discounts-for-products'] });

      const nextBaseline = { ...form, sku: form.sku.trim(), title: form.title.trim() };
      setForm(nextBaseline);
      setBaseline(nextBaseline);
      setBaselineCollections([...selectedCollectionIds]);
      setBaselineDiscounts([...selectedDiscountIds]);
      toast.success('Product saved');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!product) return;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) {
      toast.error('Please drop image files');
      return;
    }
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('Not authenticated');
      let maxOrder = images.length ? Math.max(...images.map((i) => i.display_order)) : 0;
      for (const file of list) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 10MB`);
          continue;
        }
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.data.user.id}/${product.id}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, file);
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from('product-images').getPublicUrl(fileName);
        maxOrder += 1;
        const { error } = await supabase.from('product_images').insert({
          product_id: product.id,
          image_url: publicUrl,
          is_primary: images.length === 0 && maxOrder === 1,
          display_order: maxOrder,
        });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['product-images', product.id] });
      queryClient.invalidateQueries({ queryKey: ['all-product-images'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Image(s) uploaded');
    } catch (e) {
      console.error(e);
      toast.error('Failed to upload image');
    }
  };

  const setPrimary = async (imageId: string) => {
    if (!product) return;
    await supabase.from('product_images').update({ is_primary: false }).eq('product_id', product.id);
    const { error } = await supabase
      .from('product_images')
      .update({ is_primary: true })
      .eq('id', imageId);
    if (error) {
      toast.error('Failed to set featured image');
      return;
    }
    const primary = images.find((i) => i.id === imageId);
    if (primary) {
      await supabase.from('products').update({ image: primary.image_url }).eq('id', product.id);
    }
    queryClient.invalidateQueries({ queryKey: ['product-images', product.id] });
    queryClient.invalidateQueries({ queryKey: ['all-product-images'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    toast.success('Featured image updated');
  };

  const deleteImage = async (image: ProductImage) => {
    if (!product) return;
    if (!confirm('Delete this image?')) return;
    const urlParts = image.image_url.split('/');
    const fileName = urlParts.slice(-3).join('/');
    await supabase.storage.from('product-images').remove([fileName]);
    const { error } = await supabase.from('product_images').delete().eq('id', image.id);
    if (error) {
      toast.error('Failed to delete image');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['product-images', product.id] });
    queryClient.invalidateQueries({ queryKey: ['all-product-images'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    toast.success('Image deleted');
  };

  const reorderImages = async (fromId: string, toId: string) => {
    if (!product || fromId === toId) return;
    const ordered = [...images];
    const fromIndex = ordered.findIndex((i) => i.id === fromId);
    const toIndex = ordered.findIndex((i) => i.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);
    try {
      await Promise.all(
        ordered.map((img, idx) =>
          supabase.from('product_images').update({ display_order: idx + 1 }).eq('id', img.id)
        )
      );
      queryClient.invalidateQueries({ queryKey: ['product-images', product.id] });
    } catch (e) {
      console.error(e);
      toast.error('Failed to reorder images');
    }
  };

  const tryClose = () => {
    if (isDirty && !confirm('You have unsaved changes. Discard them?')) return;
    onOpenChange(false);
  };

  const tryNavigate = (target: EditorProduct) => {
    if (isDirty && !confirm('You have unsaved changes. Discard them and switch product?')) return;
    onNavigate(target);
  };

  if (!product || !form) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && tryClose()}>
        <SheetContent className="w-full sm:max-w-5xl p-0" />
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
        if (isDirty && !confirm('You have unsaved changes. Discard them?')) {
          return;
        }
        onOpenChange(false);
      }}
    >
      <SheetContent className="w-full sm:max-w-5xl p-0 flex flex-col gap-0 overflow-hidden [&>button]:hidden">
        <div className="border-b px-4 py-3 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <SheetHeader className="text-left space-y-1">
              <SheetTitle className="truncate">{form.title || 'Untitled product'}</SheetTitle>
              <SheetDescription>
                {index >= 0 ? `Product ${index + 1} of ${products.length}` : 'Product editor'}
                {isDirty ? ' · Unsaved changes' : ''}
              </SheetDescription>
            </SheetHeader>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={!prevProduct}
              onClick={() => prevProduct && tryNavigate(prevProduct)}
              aria-label="Previous product"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={!nextProduct}
              onClick={() => nextProduct && tryNavigate(nextProduct)}
              aria-label="Next product"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={tryClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-full">
            {/* Media column */}
            <div className="border-b lg:border-b-0 lg:border-r p-4 space-y-3 bg-muted/10">
              <div className="aspect-square rounded-xl overflow-hidden bg-muted flex items-center justify-center border">
                {activeImage ? (
                  <img
                    src={activeImage.image_url}
                    alt={form.title}
                    className="h-full w-full object-cover"
                  />
                ) : product.image ? (
                  <img src={product.image} alt={form.title} className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-16 w-16 text-muted-foreground/40" />
                )}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    draggable
                    onDragStart={() => setDragImageId(img.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragImageId) void reorderImages(dragImageId, img.id);
                      setDragImageId(null);
                    }}
                    onClick={() => setActiveImageId(img.id)}
                    className={cn(
                      'relative h-16 w-16 rounded-md overflow-hidden border-2 shrink-0',
                      activeImageId === img.id ? 'border-foreground' : 'border-transparent'
                    )}
                  >
                    <img src={img.image_url} alt="" className="h-full w-full object-cover" />
                    {img.is_primary && (
                      <span className="absolute top-0.5 right-0.5 rounded-full bg-amber-400 p-0.5">
                        <Star className="h-2.5 w-2.5 text-white fill-white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {activeImage && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setPrimary(activeImage.id)}
                      disabled={activeImage.is_primary}
                    >
                      <Star className="h-3.5 w-3.5 mr-1" />
                      Set featured
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => deleteImage(activeImage)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete
                    </Button>
                  </>
                )}
              </div>

              <div
                className={cn(
                  'rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors',
                  dragOverUpload ? 'border-foreground bg-muted/40' : 'border-border/70 hover:bg-muted/20'
                )}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOverUpload(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => setDragOverUpload(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverUpload(false);
                  if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Drop images here or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP · max 10MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) void uploadFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
              {imagesLoading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" /> Loading images…
                </p>
              )}
            </div>

            {/* Fields column */}
            <div className="p-4 pb-28">
              <Tabs defaultValue="general">
                <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto gap-1 bg-muted/40 p-1">
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="pricing">Pricing</TabsTrigger>
                  <TabsTrigger value="inventory">Inventory</TabsTrigger>
                  <TabsTrigger value="organization">Organization</TabsTrigger>
                  <TabsTrigger value="performance">Performance</TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="drawer-title">Product name</Label>
                    <Input
                      id="drawer-title"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="drawer-sku">
                      SKU <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="drawer-sku"
                      value={form.sku}
                      onChange={(e) => {
                        setForm({ ...form, sku: e.target.value });
                        if (skuError) setSkuError(null);
                      }}
                      onBlur={() => void validateSku(form.sku, product.id)}
                      className={cn(skuError && 'border-destructive focus-visible:ring-destructive')}
                      placeholder="Required unique SKU"
                    />
                    {skuError ? (
                      <p className="text-xs text-destructive">{skuError}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">SKU must be unique across your catalog.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="drawer-description">Description</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setPreviewDescription((v) => !v)}
                      >
                        {previewDescription ? 'Edit' : 'Preview'}
                      </Button>
                    </div>
                    {previewDescription ? (
                      <div className="min-h-[180px] rounded-md border bg-muted/20 p-3 text-sm whitespace-pre-wrap leading-relaxed">
                        {form.description || (
                          <span className="text-muted-foreground">No description yet.</span>
                        )}
                      </div>
                    ) : (
                      <Textarea
                        id="drawer-description"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="min-h-[180px] text-sm leading-relaxed"
                        placeholder="Write a detailed product description…"
                      />
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="pricing" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="drawer-price">Price (RON)</Label>
                    <Input
                      id="drawer-price"
                      type="number"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Compare-at price is not available in the current catalog schema.
                  </p>
                  <div className="space-y-2">
                    <Label>Discounts</Label>
                    <div className="rounded-md border max-h-48 overflow-y-auto divide-y">
                      {discounts.length === 0 && (
                        <p className="p-3 text-sm text-muted-foreground">No active discounts.</p>
                      )}
                      {discounts.map((d) => (
                        <label
                          key={d.id}
                          className="flex items-center gap-2 p-3 text-sm cursor-pointer hover:bg-muted/30"
                        >
                          <Checkbox
                            checked={selectedDiscountIds.includes(d.id)}
                            onCheckedChange={(checked) => {
                              setSelectedDiscountIds((prev) =>
                                checked
                                  ? [...prev, d.id]
                                  : prev.filter((id) => id !== d.id)
                              );
                            }}
                          />
                          <span>
                            {d.discount_type === 'percentage'
                              ? `${d.discount_value}% off`
                              : `${d.discount_value} RON off`}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="inventory" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="drawer-stock">Stock</Label>
                      <Input
                        id="drawer-stock"
                        type="number"
                        value={form.stock}
                        onChange={(e) => setForm({ ...form, stock: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="drawer-threshold">Low stock threshold</Label>
                      <Input
                        id="drawer-threshold"
                        type="number"
                        value={form.low_stock_threshold}
                        onChange={(e) =>
                          setForm({ ...form, low_stock_threshold: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    Status:{' '}
                    {Number(form.stock) <= 0
                      ? 'Out of Stock'
                      : Number(form.stock) <= Number(form.low_stock_threshold || 5)
                        ? 'Low Stock'
                        : 'In Stock'}
                  </div>
                </TabsContent>

                <TabsContent value="organization" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="drawer-category">Category</Label>
                    <Input
                      id="drawer-category"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="e.g. Apparel"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Collections</Label>
                    <div className="rounded-md border max-h-56 overflow-y-auto divide-y">
                      {collections.length === 0 && (
                        <p className="p-3 text-sm text-muted-foreground">No collections yet.</p>
                      )}
                      {collections.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 p-3 text-sm cursor-pointer hover:bg-muted/30"
                        >
                          <Checkbox
                            checked={selectedCollectionIds.includes(c.id)}
                            onCheckedChange={(checked) => {
                              setSelectedCollectionIds((prev) =>
                                checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                              );
                            }}
                          />
                          <span>{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="performance" className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Stat label="Orders" value={String(metrics?.orders ?? 0)} />
                    <Stat label="Units sold" value={String(metrics?.unitsSold ?? 0)} />
                    <Stat label="Revenue" value={formatRon(metrics?.revenue ?? 0)} />
                    <Stat
                      label="Recommendation"
                      value={(metrics?.recommendation || '—').replace(/_/g, ' ')}
                    />
                  </div>
                  {metrics?.badges?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {metrics.badges.map((b) => (
                        <Badge key={b} variant="outline" className="capitalize">
                          {b.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </TabsContent>
              </Tabs>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const userId = (await supabase.auth.getUser()).data.user?.id;
                      const skuBase = (form.sku || 'SKU').trim() || 'SKU';
                      const { error } = await supabase.from('products').insert({
                        title: `Copy of ${form.title}`,
                        description: form.description,
                        price: parseFloat(form.price) || 0,
                        category: form.category || null,
                        stock: parseInt(form.stock, 10) || 0,
                        sku: `${skuBase}-COPY`,
                        low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 5,
                        image: product.image,
                        user_id: userId,
                      });
                      if (error) throw error;
                      queryClient.invalidateQueries({ queryKey: ['products'] });
                      toast.success('Product duplicated');
                    } catch (e) {
                      console.error(e);
                      toast.error('Failed to duplicate (SKU may already exist)');
                    }
                  }}
                >
                  Duplicate
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (!confirm('Delete this product?')) return;
                    onDeleted(product.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky save bar */}
        <div
          className={cn(
            'shrink-0 border-t bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3 transition-opacity',
            isDirty ? 'opacity-100' : 'opacity-60'
          )}
        >
          <p className="text-sm text-muted-foreground">
            {isDirty ? 'You have unsaved changes' : 'All changes saved'}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={!isDirty || saving} onClick={discardChanges}>
              Discard
            </Button>
            <Button type="button" disabled={!isDirty || saving} onClick={() => void saveChanges()}>
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
      <div className="font-medium mt-0.5 capitalize break-words">{value}</div>
    </div>
  );
}
