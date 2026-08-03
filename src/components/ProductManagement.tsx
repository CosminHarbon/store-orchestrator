import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Folder,
  Package,
  Search,
  Grid,
  List,
  Percent,
  Wallet,
  AlertTriangle,
  TrendingUp,
  Boxes,
  Lightbulb,
  Download,
  Copy,
  Trash2,
  Tag,
  ChevronDown,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ProductImageUpload from './ProductImageUpload';
import { ResponsiveProductTable } from './ResponsiveProductTable';
import CollectionsManagement from './CollectionsManagement';
import DiscountManagement from './DiscountManagement';
import { ProductCatalogTable } from './ProductCatalogTable';
import { ProductEditorDrawer } from './ProductEditorDrawer';
import {
  buildProductAnalytics,
  filterCatalogProducts,
  formatRon,
  type CatalogProduct,
  type ProductSaleRow,
  type ProductStockStatus,
} from '@/lib/productAnalytics';
import { cn } from '@/lib/utils';

const ProductTrendsCharts = lazy(() => import('./ProductTrendsCharts'));

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  image: string;
  category: string;
  stock: number;
  sku: string;
  low_stock_threshold: number;
  created_at?: string;
  updated_at?: string;
}

interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  is_primary: boolean;
  display_order: number;
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  delta,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  delta?: number;
}) {
  const { t: tProducts } = useTranslation('products');
  return (
    <Card className="border-border/60 bg-gradient-to-br from-background to-muted/30 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
          {title}
        </CardTitle>
        <div className="rounded-md p-1.5 bg-muted/80">
          <Icon className="h-4 w-4 text-foreground/70" />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {typeof delta === 'number' && Number.isFinite(delta) && (
          <p
            className={cn(
              'text-xs font-medium',
              delta >= 0 ? 'text-emerald-600' : 'text-rose-600'
            )}
          >
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(1)}% {tProducts('deltaVsPrior')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const ProductManagement = () => {
  const { t: tProducts } = useTranslation('products');
  const { t: tCommon } = useTranslation('common');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [imageDialogProduct, setImageDialogProduct] = useState<Product | null>(null);
  const [drawerProduct, setDrawerProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showAnalytics, setShowAnalytics] = useState(() => {
    try {
      return localStorage.getItem('products-show-analytics') === '1';
    } catch {
      return false;
    }
  });
  const [stockFilter, setStockFilter] = useState<'all' | ProductStockStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [stockMin, setStockMin] = useState('');
  const [stockMax, setStockMax] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStock, setBulkStock] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkCollectionId, setBulkCollectionId] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    category: '',
    stock: '',
    sku: '',
    low_stock_threshold: '5',
  });

  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: productImages } = useQuery({
    queryKey: ['all-product-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_images')
        .select('*')
        .eq('is_primary', true);

      if (error) throw error;
      return data as ProductImage[];
    },
  });

  const { data: discounts } = useQuery({
    queryKey: ['discounts-for-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('discounts')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      return data as Array<{
        id: string;
        discount_type: 'percentage' | 'fixed_amount';
        discount_value: number;
        start_date: string;
        end_date: string | null;
        is_active: boolean;
      }>;
    },
  });

  const { data: productDiscounts } = useQuery({
    queryKey: ['product-discounts-for-products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('product_discounts').select('*');
      if (error) throw error;
      return data as Array<{ product_id: string; discount_id: string }>;
    },
  });

  const { data: collections } = useQuery({
    queryKey: ['collections-for-products-filter'],
    queryFn: async () => {
      const { data, error } = await supabase.from('collections').select('id, name').order('name');
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
  });

  const { data: productCollections } = useQuery({
    queryKey: ['product-collections-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_collections')
        .select('product_id, collection_id');
      if (error) throw error;
      return data as Array<{ product_id: string; collection_id: string }>;
    },
  });

  const { data: orderItems } = useQuery({
    queryKey: ['order-items-for-product-analytics'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('product_id, product_title, product_price, quantity, created_at');
      if (error) throw error;
      return (data || []) as ProductSaleRow[];
    },
  });

  const catalogProducts = useMemo(
    () =>
      (products || []).map(
        (p) =>
          ({
            ...p,
            description: p.description || null,
            image: p.image || null,
            category: p.category || null,
            sku: p.sku || null,
            created_at: p.created_at || new Date().toISOString(),
            updated_at: p.updated_at || p.created_at || new Date().toISOString(),
          }) as CatalogProduct
      ),
    [products]
  );

  const analytics = useMemo(
    () => buildProductAnalytics(catalogProducts, orderItems || []),
    [catalogProducts, orderItems]
  );

  const productCollectionMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const row of productCollections || []) {
      if (!map[row.product_id]) map[row.product_id] = [];
      map[row.product_id].push(row.collection_id);
    }
    return map;
  }, [productCollections]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalogProducts) {
      set.add(p.category?.trim() || 'Uncategorized');
    }
    return [...set].sort();
  }, [catalogProducts]);

  const filteredProducts = useMemo(() => {
    const filtered = filterCatalogProducts(catalogProducts, analytics.metricsById, {
      search: searchQuery,
      stockFilter,
      category: categoryFilter,
      collectionId: collectionFilter,
      productCollectionMap,
      priceMin: priceMin ? Number(priceMin) : null,
      priceMax: priceMax ? Number(priceMax) : null,
      stockMin: stockMin ? Number(stockMin) : null,
      stockMax: stockMax ? Number(stockMax) : null,
    });
    // Cast back for existing components
    return filtered.map((p) => products!.find((x) => x.id === p.id)!).filter(Boolean);
  }, [
    catalogProducts,
    analytics.metricsById,
    searchQuery,
    stockFilter,
    categoryFilter,
    collectionFilter,
    productCollectionMap,
    priceMin,
    priceMax,
    stockMin,
    stockMax,
    products,
  ]);

  const inventoryHealth = useMemo(() => {
    const out = catalogProducts.filter((p) => analytics.metricsById[p.id]?.stockStatus === 'out_of_stock');
    const low = catalogProducts.filter((p) => analytics.metricsById[p.id]?.stockStatus === 'low_stock');
    const over = catalogProducts.filter(
      (p) => p.stock > (p.low_stock_threshold || 5) * 10 && p.stock > 50
    );
    return { out, low, over };
  }, [catalogProducts, analytics.metricsById]);

  const createProductMutation = useMutation({
    mutationFn: async (productData: any) => {
      const { data, error } = await supabase
        .from('products')
        .insert({
          ...productData,
          price: parseFloat(productData.price),
          stock: parseInt(productData.stock),
          low_stock_threshold: parseInt(productData.low_stock_threshold || '5'),
          user_id: (await supabase.auth.getUser()).data.user?.id,
        })
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(tProducts('toast.created'));
      const newProduct = data[0];
      if (newProduct) {
        setDrawerProduct(newProduct);
      }
      resetForm();
    },
    onError: (error) => {
      toast.error(tProducts('toast.createFailed'));
      console.error(error);
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, ...productData }: any) => {
      const { data, error } = await supabase
        .from('products')
        .update({
          ...productData,
          price: parseFloat(productData.price),
          stock: parseInt(productData.stock),
          low_stock_threshold: parseInt(productData.low_stock_threshold || '5'),
        })
        .eq('id', id)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(tProducts('toast.updated'));
      resetForm();
    },
    onError: (error) => {
      toast.error(tProducts('toast.updateFailed'));
      console.error(error);
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(tProducts('toast.deleted'));
    },
    onError: (error) => {
      toast.error(tProducts('toast.deleteFailed'));
      console.error(error);
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      price: '',
      category: '',
      stock: '',
      sku: '',
      low_stock_threshold: '5',
    });
    setEditingProduct(null);
    setIsDialogOpen(false);
  };

  const assertUniqueSku = async (sku: string, excludeId?: string) => {
    const trimmed = sku.trim();
    if (!trimmed) {
      toast.error(tProducts('toast.skuRequired'));
      return false;
    }
    let query = supabase.from('products').select('id').eq('sku', trimmed).limit(1);
    if (excludeId) query = query.neq('id', excludeId);
    const { data, error } = await query;
    if (error) {
      toast.error(tProducts('toast.skuValidateFailed'));
      return false;
    }
    if (data?.length) {
      toast.error(tProducts('toast.skuTaken'));
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await assertUniqueSku(formData.sku, editingProduct?.id))) return;

    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, ...formData, sku: formData.sku.trim() });
    } else {
      createProductMutation.mutate({ ...formData, sku: formData.sku.trim() });
    }
  };

  const handleEdit = (product: Product) => {
    setDrawerProduct(product);
  };

  const handleDelete = (id: string) => {
    if (confirm(tProducts('confirm.deleteOne'))) {
      deleteProductMutation.mutate(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleProductClick = (product: Product) => {
    setDrawerProduct(product);
  };

  useEffect(() => {
    if (!drawerProduct || !products) return;
    const fresh = products.find((p) => p.id === drawerProduct.id);
    if (!fresh) return;
    if (
      fresh.updated_at !== drawerProduct.updated_at ||
      fresh.title !== drawerProduct.title ||
      fresh.sku !== drawerProduct.sku ||
      fresh.price !== drawerProduct.price ||
      fresh.stock !== drawerProduct.stock ||
      fresh.description !== drawerProduct.description ||
      fresh.category !== drawerProduct.category ||
      fresh.low_stock_threshold !== drawerProduct.low_stock_threshold
    ) {
      setDrawerProduct(fresh);
    }
  }, [products, drawerProduct]);

  const toggleAnalytics = (next: boolean) => {
    setShowAnalytics(next);
    try {
      localStorage.setItem('products-show-analytics', next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectedProducts = useMemo(
    () => (products || []).filter((p) => selectedIds.has(p.id)),
    [products, selectedIds]
  );

  const exportSelected = () => {
    const rows = (selectedProducts.length ? selectedProducts : filteredProducts).map((p) => ({
      id: p.id,
      title: p.title,
      sku: p.sku,
      category: p.category,
      price: p.price,
      stock: p.stock,
      low_stock_threshold: p.low_stock_threshold,
      orders: analytics.metricsById[p.id]?.orders ?? 0,
      revenue: analytics.metricsById[p.id]?.revenue ?? 0,
    }));
    const header = Object.keys(rows[0] || { title: '' }).join(',');
    const body = rows
      .map((r) =>
        Object.values(r)
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    const blob = new Blob([[header, body].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(tProducts('toast.exported', { count: rows.length }));
  };

  const duplicateSelected = async () => {
    if (!selectedProducts.length) return;
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const payload = selectedProducts.map((p) => ({
        title: tProducts('duplicate.copyOf', { title: p.title }),
        description: p.description,
        price: p.price,
        category: p.category,
        stock: p.stock,
        sku: p.sku ? `${p.sku}-COPY` : null,
        low_stock_threshold: p.low_stock_threshold,
        image: p.image,
        user_id: userId,
      }));
      const { error } = await supabase.from('products').insert(payload);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSelectedIds(new Set());
      toast.success(tProducts('toast.duplicated', { count: payload.length }));
    } catch (e) {
      console.error(e);
      toast.error(tProducts('toast.duplicateFailed'));
    }
  };

  const deleteSelected = async () => {
    if (!selectedProducts.length) return;
    if (!confirm(tProducts('confirm.deleteSelected', { count: selectedProducts.length }))) return;
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .in(
          'id',
          selectedProducts.map((p) => p.id)
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSelectedIds(new Set());
      toast.success(tProducts('toast.selectedDeleted'));
    } catch (e) {
      console.error(e);
      toast.error(tProducts('toast.selectedDeleteFailed'));
    }
  };

  const bulkUpdateField = async (patch: Record<string, unknown>) => {
    if (!selectedProducts.length) return;
    try {
      const { error } = await supabase
        .from('products')
        .update(patch)
        .in(
          'id',
          selectedProducts.map((p) => p.id)
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(tProducts('toast.bulkUpdated'));
    } catch (e) {
      console.error(e);
      toast.error(tProducts('toast.bulkUpdateFailed'));
    }
  };

  const assignCollection = async () => {
    if (!selectedProducts.length || !bulkCollectionId) return;
    try {
      const rows = selectedProducts.map((p) => ({
        product_id: p.id,
        collection_id: bulkCollectionId,
      }));
      const { error } = await supabase.from('product_collections').upsert(rows, {
        onConflict: 'product_id,collection_id',
        ignoreDuplicates: true,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['product-collections-map'] });
      toast.success(tProducts('toast.collectionUpdated'));
    } catch (e) {
      console.error(e);
      toast.error(tProducts('toast.collectionFailed'));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-3 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const drawerMetrics = drawerProduct ? analytics.metricsById[drawerProduct.id] : null;

  return (
    <div className="w-full">
      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-background/80 backdrop-blur-lg border border-border/50 rounded-2xl shadow-lg">
          <TabsTrigger
            value="products"
            className="flex items-center gap-2 rounded-xl data-[state=active]:bg-primary-dark data-[state=active]:text-white transition-all duration-200 hover:bg-muted/50"
          >
            <Package className="h-4 w-4" />
            {tProducts('title')}
          </TabsTrigger>
          <TabsTrigger
            value="collections"
            className="flex items-center gap-2 rounded-xl data-[state=active]:bg-primary-dark data-[state=active]:text-white transition-all duration-200 hover:bg-muted/50"
          >
            <Folder className="h-4 w-4" />
            {tProducts('collectionsTab')}
          </TabsTrigger>
          <TabsTrigger
            value="discounts"
            className="flex items-center gap-2 rounded-xl data-[state=active]:bg-primary-dark data-[state=active]:text-white transition-all duration-200 hover:bg-muted/50"
          >
            <Percent className="h-4 w-4" />
            {tCommon('nav.discounts')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-8 mt-6">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{tProducts('title')}</h2>
              <p className="text-sm text-muted-foreground">
                {tProducts('subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={exportSelected}>
                <Download className="h-4 w-4 mr-2" />
                {tCommon('export')}
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => resetForm()} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    {tProducts('addProduct')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md w-[calc(100vw-2rem)] sm:w-full max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingProduct ? tProducts('editProduct') : tProducts('addNewProduct')}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">{tProducts('field.productName')}</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">{tProducts('field.description')}</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="price">{tProducts('field.priceRon')}</Label>
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          value={formData.price}
                          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="stock">{tProducts('stock')}</Label>
                        <Input
                          id="stock"
                          type="number"
                          value={formData.stock}
                          onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="low_stock_threshold">{tProducts('field.lowStockAlertThreshold')}</Label>
                      <Input
                        id="low_stock_threshold"
                        type="number"
                        value={formData.low_stock_threshold}
                        onChange={(e) =>
                          setFormData({ ...formData, low_stock_threshold: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">{tProducts('field.category')}</Label>
                      <Input
                        id="category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sku">
                        {tProducts('sku')} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="sku"
                        value={formData.sku}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                        placeholder={tProducts('skuRequiredPlaceholder')}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        {tProducts('field.skuHint')}
                      </p>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button
                        type="submit"
                        disabled={createProductMutation.isPending || updateProductMutation.isPending}
                        className="flex-1"
                      >
                        {editingProduct ? tProducts('updateProduct') : tProducts('createProduct')}
                      </Button>
                      <Button type="button" variant="outline" onClick={resetForm}>
                        {tCommon('cancel')}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* KPIs — always visible */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {tProducts('section.overview')}
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => toggleAnalytics(!showAnalytics)}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                {showAnalytics ? tCommon('hideAnalytics') : tCommon('showAnalytics')}
                <ChevronDown
                  className={cn('h-4 w-4 ml-1 transition-transform', showAnalytics && 'rotate-180')}
                />
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              title={tProducts('kpi.total')}
              value={String(analytics.kpis.totalProducts)}
              subtitle={tProducts('kpi.totalSub')}
              icon={Package}
              delta={analytics.deltas.totalProducts}
            />
            <KpiCard
              title={tProducts('kpi.active')}
              value={String(analytics.kpis.activeProducts)}
              subtitle={tProducts('kpi.activeSub')}
              icon={Boxes}
            />
            <KpiCard
              title={tProducts('kpi.outOfStock')}
              value={String(analytics.kpis.outOfStock)}
              subtitle={tProducts('kpi.outOfStockSub')}
              icon={AlertTriangle}
            />
            <KpiCard
              title={tProducts('kpi.lowStock')}
              value={String(analytics.kpis.lowStock)}
              subtitle={tProducts('kpi.lowStockSub')}
              icon={AlertTriangle}
            />
            </div>
            {showAnalytics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              title={tProducts('kpi.inventoryValue')}
              value={formatRon(analytics.kpis.inventoryValue)}
              subtitle={tProducts('kpi.inventoryValueSub')}
              icon={Wallet}
            />
            <KpiCard
              title={tProducts('kpi.avgPrice')}
              value={formatRon(analytics.kpis.averagePrice)}
              subtitle={tProducts('kpi.avgPriceSub')}
              icon={Tag}
            />
            <KpiCard
              title={tProducts('kpi.addedThisMonth')}
              value={String(analytics.kpis.addedThisMonth)}
              subtitle={tProducts('kpi.addedThisMonthSub')}
              icon={TrendingUp}
              delta={analytics.deltas.addedThisMonth}
            />
            <KpiCard
              title={tProducts('kpi.neverSold')}
              value={String(
                catalogProducts.filter((p) => analytics.metricsById[p.id]?.unitsSold === 0).length
              )}
              subtitle={tProducts('kpi.neverSoldSub')}
              icon={Package}
            />
              </div>
            )}
          </section>

          <Collapsible open={showAnalytics} onOpenChange={toggleAnalytics}>
            <CollapsibleContent className="space-y-8">
          {/* Insights */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              {tProducts('section.insights')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {analytics.insights.map((insight) => (
                <Card
                  key={insight}
                  className="border-border/60 bg-gradient-to-br from-muted/40 via-background to-background"
                >
                  <CardContent className="pt-4 pb-4 flex gap-3 items-start">
                    <div className="rounded-full bg-amber-500/15 p-1.5 mt-0.5">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-700" />
                    </div>
                    <p className="text-sm leading-relaxed">{insight}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Inventory Health */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tProducts('kpi.outOfStock')}</CardTitle>
                <CardDescription>{tProducts('inventory.restockSoon')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {inventoryHealth.out.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left text-sm flex justify-between gap-2 hover:underline"
                    onClick={() => handleProductClick(products!.find((x) => x.id === p.id)!)}
                  >
                    <span className="truncate">{p.title}</span>
                    <Badge className="bg-rose-100 text-rose-800 border-0">0</Badge>
                  </button>
                ))}
                {!inventoryHealth.out.length && (
                  <p className="text-sm text-muted-foreground">{tProducts('inventory.allHaveStock')}</p>
                )}
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tProducts('kpi.lowStock')}</CardTitle>
                <CardDescription>{tProducts('inventory.belowThreshold')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {inventoryHealth.low.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left text-sm flex justify-between gap-2 hover:underline"
                    onClick={() => handleProductClick(products!.find((x) => x.id === p.id)!)}
                  >
                    <span className="truncate">{p.title}</span>
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0">{p.stock}</Badge>
                  </button>
                ))}
                {!inventoryHealth.low.length && (
                  <p className="text-sm text-muted-foreground">{tProducts('inventory.noLowStock')}</p>
                )}
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tProducts('section.recommendations')}</CardTitle>
                <CardDescription>{tProducts('inventory.basedOnSales')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {catalogProducts
                  .filter((p) => {
                    const r = analytics.metricsById[p.id]?.recommendation;
                    return r === 'high_selling' || r === 'not_selling' || r === 'restock_soon';
                  })
                  .slice(0, 5)
                  .map((p) => {
                    const rec = analytics.metricsById[p.id]?.recommendation;
                    const label =
                      rec === 'restock_soon'
                        ? tProducts('badge.restockSoon')
                        : rec === 'high_selling'
                          ? tProducts('badge.highSelling')
                          : tProducts('badge.notSelling');
                    return (
                      <div key={p.id} className="flex justify-between gap-2">
                        <span className="truncate">{p.title}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {label}
                        </Badge>
                      </div>
                    );
                  })}
                {!catalogProducts.some((p) =>
                  ['high_selling', 'not_selling', 'restock_soon'].includes(
                    analytics.metricsById[p.id]?.recommendation || ''
                  )
                ) && <p className="text-muted-foreground">{tProducts('inventory.noRecommendations')}</p>}
              </CardContent>
            </Card>
          </section>

          {/* Charts */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {tProducts('section.analytics')}
            </h3>
            <Suspense
              fallback={
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                      <CardContent className="h-[240px] flex items-center justify-center">
                        <Skeleton className="h-32 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              }
            >
              <ProductTrendsCharts analytics={analytics} />
            </Suspense>
          </section>
            </CollapsibleContent>
          </Collapsible>

          {/* Filters + catalog */}
          <section className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {tProducts('section.catalog')}
              </h3>
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(value: 'grid' | 'list') => value && setViewMode(value)}
              >
                <ToggleGroupItem value="list" aria-label={tProducts('view.table')} className="rounded-xl">
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="grid" aria-label={tProducts('view.grid')} className="rounded-xl">
                  <Grid className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <Card className="border-border/60">
              <CardHeader className="pb-3 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={tProducts('searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                  <Select
                    value={stockFilter}
                    onValueChange={(v) => setStockFilter(v as 'all' | ProductStockStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tProducts('filter.stock')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tProducts('filter.allStock')}</SelectItem>
                      <SelectItem value="in_stock">{tProducts('filter.inStock')}</SelectItem>
                      <SelectItem value="low_stock">{tProducts('filter.lowStock')}</SelectItem>
                      <SelectItem value="out_of_stock">{tProducts('filter.outOfStock')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder={tProducts('filter.category')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tProducts('filter.allCategories')}</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c === 'Uncategorized' ? tCommon('uncategorized') : c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={collectionFilter} onValueChange={setCollectionFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder={tProducts('filter.collection')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tProducts('filter.allCollections')}</SelectItem>
                      {(collections || []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder={tProducts('filter.minPrice')}
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder={tProducts('filter.maxPrice')}
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder={tProducts('filter.minStock')}
                      value={stockMin}
                      onChange={(e) => setStockMin(e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder={tProducts('filter.maxStock')}
                      value={stockMax}
                      onChange={(e) => setStockMax(e.target.value)}
                    />
                  </div>
                </div>

                {selectedIds.size > 0 && (
                  <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
                    <div className="text-sm font-medium">{tCommon('selected', { count: selectedIds.size })}</div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={duplicateSelected}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> {tProducts('bulk.duplicate')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={exportSelected}>
                        <Download className="h-3.5 w-3.5 mr-1" /> {tProducts('bulk.export')}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={deleteSelected}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> {tProducts('bulk.delete')}
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder={tProducts('bulk.newStock')}
                          value={bulkStock}
                          onChange={(e) => setBulkStock(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            bulkStock &&
                            bulkUpdateField({ stock: parseInt(bulkStock, 10) }).then(() =>
                              setBulkStock('')
                            )
                          }
                        >
                          {tProducts('bulk.setStock')}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder={tProducts('bulk.newPrice')}
                          value={bulkPrice}
                          onChange={(e) => setBulkPrice(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            bulkPrice &&
                            bulkUpdateField({ price: parseFloat(bulkPrice) }).then(() =>
                              setBulkPrice('')
                            )
                          }
                        >
                          {tProducts('bulk.setPrice')}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder={tProducts('field.category')}
                          value={bulkCategory}
                          onChange={(e) => setBulkCategory(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            bulkCategory &&
                            bulkUpdateField({ category: bulkCategory }).then(() =>
                              setBulkCategory('')
                            )
                          }
                        >
                          {tProducts('bulk.setCategory')}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Select value={bulkCollectionId} onValueChange={setBulkCollectionId}>
                          <SelectTrigger>
                            <SelectValue placeholder={tProducts('filter.collection')} />
                          </SelectTrigger>
                          <SelectContent>
                            {(collections || []).map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="secondary" onClick={assignCollection}>
                          {tProducts('bulk.assign')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-14 text-muted-foreground space-y-3">
                    <Package className="h-12 w-12 mx-auto opacity-40" />
                    <div>
                      <p className="font-medium text-foreground">
                        {searchQuery || stockFilter !== 'all'
                          ? tProducts('empty.filtered')
                          : tProducts('empty.createFirst')}
                      </p>
                      <p className="text-sm max-w-md mx-auto mt-1">
                        {searchQuery || stockFilter !== 'all'
                          ? tProducts('empty.filteredHint')
                          : tProducts('empty.createFirstHint')}
                      </p>
                    </div>
                    {!searchQuery && stockFilter === 'all' && (
                      <Button onClick={() => setIsDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        {tProducts('addProduct')}
                      </Button>
                    )}
                  </div>
                ) : viewMode === 'list' ? (
                  <ProductCatalogTable
                    products={filteredProducts}
                    productImages={productImages || []}
                    metricsById={analytics.metricsById}
                    discounts={discounts || []}
                    productDiscounts={productDiscounts || []}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onToggleSelectAll={toggleSelectAll}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onManageImages={setImageDialogProduct}
                    onProductClick={handleProductClick}
                  />
                ) : (
                  <ResponsiveProductTable
                    products={filteredProducts}
                    productImages={productImages || []}
                    discounts={discounts || []}
                    productDiscounts={productDiscounts || []}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onManageImages={setImageDialogProduct}
                    onProductClick={handleProductClick}
                  />
                )}
              </CardContent>
            </Card>
          </section>

          {/* Floating quick action */}
          <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2">
            <Button
              size="lg"
              className="rounded-full shadow-lg h-12 px-5"
              onClick={() => {
                resetForm();
                setIsDialogOpen(true);
              }}
            >
              <Plus className="h-5 w-5 mr-2" />
              {tProducts('addProduct')}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="collections" className="space-y-6">
          <CollectionsManagement />
        </TabsContent>

        <TabsContent value="discounts" className="space-y-6">
          <DiscountManagement />
        </TabsContent>
      </Tabs>

      {/* Images modal — still available for advanced media uploads */}
      {imageDialogProduct && (
        <Dialog
          open={!!imageDialogProduct}
          onOpenChange={(open) => !open && setImageDialogProduct(null)}
        >
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{tProducts('manageImages', { title: imageDialogProduct.title })}</DialogTitle>
            </DialogHeader>
            <ProductImageUpload
              productId={imageDialogProduct.id}
              onImagesChange={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
            />
          </DialogContent>
        </Dialog>
      )}

      <ProductEditorDrawer
        product={drawerProduct}
        products={filteredProducts}
        open={!!drawerProduct}
        onOpenChange={(open) => {
          if (!open) setDrawerProduct(null);
        }}
        onNavigate={(product) => setDrawerProduct(product as Product)}
        onDeleted={(id) => {
          deleteProductMutation.mutate(id);
          setDrawerProduct(null);
        }}
        metrics={drawerMetrics}
        collections={collections || []}
        discounts={(discounts || []).map((d) => ({
          id: d.id,
          discount_type: d.discount_type,
          discount_value: d.discount_value,
          is_active: d.is_active,
        }))}
      />
    </div>
  );
};

export default ProductManagement;
