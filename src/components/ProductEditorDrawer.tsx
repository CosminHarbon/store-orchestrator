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
import { ProductVariantsEditor } from '@/components/product-variants/ProductVariantsEditor';
import { bundleToDraft } from '@/lib/productVariants/bundle';
import {
  activeVariantStockSum,
  emptyVariantDraft,
  serializeVariantDraft,
  toSavePayload,
  validateVariantDraft,
} from '@/lib/productVariants/cartesian';
import type { SaveProductVariantsResult, VariantDraft } from '@/lib/productVariants/types';
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
import { useTranslation } from 'react-i18next';
import { mapPool, uploadMedia } from '@/lib/media/uploadMedia';
import { deleteMediaAsset } from '@/lib/media/deleteMedia';
import { merchantMediaMessage } from '@/lib/media/errors';
import { formatRon, type ProductMetrics } from '@/lib/productAnalytics';
import {
  normalizeReviewStatus,
  relativeTime,
  statusBadgeClass,
  type ReviewRow,
  type ReviewStatus,
} from '@/lib/reviewAnalytics';
import { cn } from '@/lib/utils';
import { resolveTenantUserId } from '@/hooks/useImpersonation';

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
  show_stock_to_customers?: boolean | null;
  has_variants?: boolean;
  variant_count?: number;
  min_variant_price?: number | null;
  max_variant_price?: number | null;
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
  show_stock_override: 'inherit' | 'show' | 'hide';
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
    show_stock_override:
      product.show_stock_to_customers == null
        ? 'inherit'
        : product.show_stock_to_customers
          ? 'show'
          : 'hide',
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
  const { t } = useTranslation('common');
  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<FormState | null>(null);
  const [skuError, setSkuError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<'optimizing' | 'uploading' | 'finalizing' | null>(
    null,
  );
  const [previewDescription, setPreviewDescription] = useState(false);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [baselineCollections, setBaselineCollections] = useState<string[]>([]);
  const [selectedDiscountIds, setSelectedDiscountIds] = useState<string[]>([]);
  const [baselineDiscounts, setBaselineDiscounts] = useState<string[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [dragOverUpload, setDragOverUpload] = useState(false);
  const [dragImageId, setDragImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [variantDraft, setVariantDraft] = useState<VariantDraft>(emptyVariantDraft);
  const [variantBaseline, setVariantBaseline] = useState<VariantDraft>(emptyVariantDraft);
  const variantHydratedFor = useRef<string | null>(null);

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

  const { data: productReviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ['product-reviews-admin', product?.id],
    enabled: !!product?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('product_id', product!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        ...r,
        status: normalizeReviewStatus(r as Partial<ReviewRow>),
      })) as ReviewRow[];
    },
  });

  const { data: variantBundle } = useQuery({
    queryKey: ['product-variants', product?.id, product?.has_variants],
    enabled: !!product?.id && open,
    queryFn: async () => {
      const productId = product!.id;
      const { data: options, error: optionsError } = await supabase
        .from('product_options')
        .select('*')
        .eq('product_id', productId)
        .eq('archived', false)
        .order('position', { ascending: true });
      if (optionsError) throw optionsError;

      const optionIds = (options || []).map((o: { id: string }) => o.id);
      const { data: values, error: valuesError } = optionIds.length
        ? await supabase
            .from('product_option_values')
            .select('*')
            .in('option_id', optionIds)
            .eq('archived', false)
            .order('position', { ascending: true })
        : { data: [], error: null };
      if (valuesError) throw valuesError;

      const { data: variants, error: variantsError } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', productId)
        .order('position', { ascending: true });
      if (variantsError) throw variantsError;

      const variantIds = (variants || []).map((v: { id: string }) => v.id);
      const valueIds = (values || []).map((v: { id: string }) => v.id);
      const { data: mappings, error: mappingsError } = variantIds.length
        ? await supabase
            .from('product_variant_values')
            .select('*')
            .in('variant_id', variantIds)
        : { data: [], error: null };
      if (mappingsError) throw mappingsError;

      const { data: valueImages, error: valueImagesError } = valueIds.length
        ? await supabase
            .from('product_option_value_images')
            .select('option_value_id, image_id, position')
            .in('option_value_id', valueIds)
            .order('position', { ascending: true })
        : { data: [], error: null };
      if (valueImagesError) throw valueImagesError;

      return {
        hasVariants: !!product!.has_variants,
        options: options || [],
        values: values || [],
        variants: variants || [],
        mappings: mappings || [],
        valueImages: valueImages || [],
      };
    },
  });

  const reviewStats = useMemo(() => {
    const total = productReviews.length;
    const avg = total === 0 ? 0 : productReviews.reduce((s, r) => s + r.rating, 0) / total;
    const pending = productReviews.filter((r) => r.status === 'pending').length;
    const approved = productReviews.filter((r) => r.status === 'approved').length;
    return { total, avg, pending, approved };
  }, [productReviews]);

  const moderateProductReview = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReviewStatus }) => {
      const { error } = await supabase
        .from('reviews')
        .update({ status, is_approved: status === 'approved' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-reviews-admin', product?.id] });
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Review updated');
    },
    onError: () => toast.error('Failed to update review'),
  });

  useEffect(() => {
    if (!product || !open) return;
    const next = toForm(product);
    setForm(next);
    setBaseline(next);
    setSkuError(null);
    setPreviewDescription(false);
    setActiveImageId(null);
    variantHydratedFor.current = null;
    setVariantDraft(emptyVariantDraft());
    setVariantBaseline(emptyVariantDraft());
  }, [product?.id, open]);

  useEffect(() => {
    if (!open || !product?.id || !variantBundle) return;
    if (variantHydratedFor.current === product.id) return;
    const next = bundleToDraft(variantBundle);
    setVariantDraft(next);
    setVariantBaseline(next);
    variantHydratedFor.current = product.id;
  }, [open, product?.id, variantBundle]);

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
      form.description !== baseline.description ||
      form.show_stock_override !== baseline.show_stock_override);

  const dirtyCollections =
    selectedCollectionIds.slice().sort().join(',') !==
    baselineCollections.slice().sort().join(',');
  const dirtyDiscounts =
    selectedDiscountIds.slice().sort().join(',') !==
    baselineDiscounts.slice().sort().join(',');
  const dirtyVariants =
    serializeVariantDraft(variantDraft) !== serializeVariantDraft(variantBaseline);
  const isDirty = dirtyForm || dirtyCollections || dirtyDiscounts || dirtyVariants;
  const variantStockTotal = activeVariantStockSum(variantDraft);

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
    setVariantDraft(variantBaseline);
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

    const variantCheck = validateVariantDraft(variantDraft);
    if (!variantCheck.ok) {
      toast.error(variantCheck.message);
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
          ...(variantDraft.enabled
            ? {}
            : { stock: parseInt(form.stock, 10) || 0 }),
          low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 5,
          category: form.category.trim() || null,
          description: form.description,
          show_stock_to_customers:
            form.show_stock_override === 'inherit'
              ? null
              : form.show_stock_override === 'show',
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

      const { data: variantSave, error: variantError } = await supabase.rpc(
        'save_product_variants',
        {
          p_product_id: product.id,
          p_payload: toSavePayload(variantDraft),
        }
      );
      if (variantError) throw variantError;
      const variantResult = variantSave as SaveProductVariantsResult;
      if (!variantResult?.ok) {
        toast.error(variantResult?.message || 'Could not save variants');
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-collections'] });
      queryClient.invalidateQueries({ queryKey: ['product-discounts'] });
      queryClient.invalidateQueries({ queryKey: ['product-collections-map'] });
      queryClient.invalidateQueries({ queryKey: ['product-discounts-for-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-variant-stats'] });
      variantHydratedFor.current = null;
      await queryClient.invalidateQueries({ queryKey: ['product-variants', product.id] });

      const parentStock =
        variantDraft.enabled && typeof variantResult.parent_stock === 'number'
          ? String(variantResult.parent_stock)
          : form.stock;
      const nextBaseline = {
        ...form,
        sku: form.sku.trim(),
        title: form.title.trim(),
        stock: parentStock,
      };
      setForm(nextBaseline);
      setBaseline(nextBaseline);
      setBaselineCollections([...selectedCollectionIds]);
      setBaselineDiscounts([...selectedDiscountIds]);
      setVariantBaseline(variantDraft);
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
    const list = Array.from(files).filter((f) => f.type.startsWith('image/') || !f.type);
    if (!list.length) {
      toast.error('Please drop image files');
      return;
    }
    try {
      let maxOrder = images.length ? Math.max(...images.map((i) => i.display_order)) : 0;
      const medias = await mapPool(list, 2, async (file) =>
        uploadMedia({
          file,
          mediaType: 'product',
          relatedEntityId: product.id,
          onProgress: setUploadPhase,
        }),
      );
      for (const media of medias) {
        maxOrder += 1;
        const { error } = await supabase.from('product_images').insert({
          product_id: product.id,
          image_url: media.publicUrl,
          is_primary: images.length === 0 && maxOrder === 1,
          display_order: maxOrder,
        });
        if (error) {
          await deleteMediaAsset({ assetId: media.assetId });
          throw error;
        }
      }
      queryClient.invalidateQueries({ queryKey: ['product-images', product.id] });
      queryClient.invalidateQueries({ queryKey: ['all-product-images'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['media-usage'] });
      toast.success('Image(s) uploaded');
    } catch (e) {
      console.error(e);
      toast.error(merchantMediaMessage(e, t));
    } finally {
      setUploadPhase(null);
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
    try {
      const { error } = await supabase.from('product_images').delete().eq('id', image.id);
      if (error) {
        toast.error('Failed to delete image');
        return;
      }
      await deleteMediaAsset({ publicUrl: image.image_url });
    } catch (e) {
      toast.error(merchantMediaMessage(e, t));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['product-images', product.id] });
    queryClient.invalidateQueries({ queryKey: ['all-product-images'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    setVariantDraft((prev) => ({
      ...prev,
      options: prev.options.map((option) => ({
        ...option,
        values: option.values.map((value) => ({
          ...value,
          imageIds: value.imageIds.filter((id) => id !== image.id),
        })),
      })),
    }));
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
                <p className="text-sm font-medium">
                  {uploadPhase === 'optimizing'
                    ? t('media.optimizing')
                    : uploadPhase === 'finalizing'
                      ? t('media.finalizing')
                      : uploadPhase === 'uploading'
                        ? t('media.uploading')
                        : 'Drop images here or click to upload'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('media.photoHint')}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
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
                  <TabsTrigger value="variants">Variants</TabsTrigger>
                  <TabsTrigger value="inventory">Inventory</TabsTrigger>
                  <TabsTrigger value="organization">Organization</TabsTrigger>
                  <TabsTrigger value="performance">Performance</TabsTrigger>
                  <TabsTrigger value="reviews">
                    Reviews
                    {reviewStats.pending > 0 ? (
                      <span className="ml-1.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] px-1.5 py-0.5 tabular-nums">
                        {reviewStats.pending}
                      </span>
                    ) : null}
                  </TabsTrigger>
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

                <TabsContent value="variants" className="space-y-4 mt-4">
                  <ProductVariantsEditor
                    draft={variantDraft}
                    onChange={setVariantDraft}
                    basePrice={parseFloat(form.price) || 0}
                    baseSku={form.sku}
                    productImages={images.map((image) => ({
                      id: image.id,
                      image_url: image.image_url,
                    }))}
                  />
                </TabsContent>

                <TabsContent value="inventory" className="space-y-4 mt-4">
                  {variantDraft.enabled ? (
                    <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
                      <p className="text-sm font-medium">Stock is managed under Variants</p>
                      <p className="text-sm text-muted-foreground">
                        This product sells by combination. The figure below is the sum of active
                        variant stock and cannot be edited here.
                      </p>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="space-y-2">
                          <Label>Total stock</Label>
                          <Input
                            value={String(variantStockTotal)}
                            readOnly
                            className="bg-muted/40 tabular-nums"
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
                    </div>
                  ) : (
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
                  )}
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    Status:{' '}
                    {(variantDraft.enabled ? variantStockTotal : Number(form.stock)) <= 0
                      ? 'Out of Stock'
                      : (variantDraft.enabled ? variantStockTotal : Number(form.stock)) <=
                          Number(form.low_stock_threshold || 5)
                        ? 'Low Stock'
                        : 'In Stock'}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="drawer-show-stock">Show stock to customers</Label>
                    <select
                      id="drawer-show-stock"
                      className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                      value={form.show_stock_override}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          show_stock_override: e.target.value as FormState['show_stock_override'],
                        })
                      }
                    >
                      <option value="inherit">Use store default</option>
                      <option value="show">Always show stock</option>
                      <option value="hide">Hide stock on storefront</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Inventory management still works. This only hides quantity from customers.
                    </p>
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

                <TabsContent value="reviews" className="space-y-4 mt-4">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-lg border bg-card/50 p-3">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Average</div>
                      <div className="mt-1 flex items-center gap-1.5 font-semibold tabular-nums">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {reviewStats.total ? reviewStats.avg.toFixed(1) : '—'}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-card/50 p-3">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Total</div>
                      <div className="mt-1 font-semibold tabular-nums">{reviewStats.total}</div>
                    </div>
                    <div className="rounded-lg border bg-card/50 p-3">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Pending</div>
                      <div className="mt-1 font-semibold tabular-nums">{reviewStats.pending}</div>
                    </div>
                  </div>

                  {reviewsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading reviews…</p>
                  ) : productReviews.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No reviews for this product yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {productReviews.slice(0, 12).map((r) => {
                        const st = normalizeReviewStatus(r);
                        return (
                          <div key={r.id} className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium truncate">{r.customer_name}</span>
                                  <Badge className={statusBadgeClass(st)}>
                                    {st.charAt(0).toUpperCase() + st.slice(1)}
                                  </Badge>
                                </div>
                                <div className="flex gap-0.5 mt-1">
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <Star
                                      key={s}
                                      className={cn(
                                        'h-3 w-3',
                                        s <= r.rating
                                          ? 'fill-amber-400 text-amber-400'
                                          : 'text-muted-foreground/30'
                                      )}
                                    />
                                  ))}
                                </div>
                              </div>
                              <span className="text-[11px] text-muted-foreground shrink-0">
                                {relativeTime(r.created_at)}
                              </span>
                            </div>
                            {r.review_text && (
                              <p className="text-sm text-muted-foreground line-clamp-3">{r.review_text}</p>
                            )}
                            {st === 'pending' && (
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={moderateProductReview.isPending}
                                  onClick={() =>
                                    moderateProductReview.mutate({ id: r.id, status: 'approved' })
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={moderateProductReview.isPending}
                                  onClick={() =>
                                    moderateProductReview.mutate({ id: r.id, status: 'rejected' })
                                  }
                                >
                                  Reject
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const userId = await resolveTenantUserId(
                        async () => (await supabase.auth.getUser()).data.user?.id
                      );
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
                  onClick={async () => {
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
