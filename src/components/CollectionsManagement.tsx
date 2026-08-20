import { useMemo, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpDown,
  BarChart3,
  ChevronDown,
  Folder,
  FolderOpen,
  Package,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { CollectionEditorDrawer, type CollectionRow } from './CollectionEditorDrawer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatRon } from '@/lib/paymentAnalytics';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/i18n/format';
import { useImpersonation, resolveTenantUserId } from '@/hooks/useImpersonation';

type SortKey = 'name' | 'product_count' | 'inventory_value' | 'revenue' | 'updated_at';

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
}) {
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
      </CardContent>
    </Card>
  );
}

const CollectionsManagement = () => {
  const { t: tCollections } = useTranslation('collections');
  const { t: tCommon } = useTranslation('common');
  const queryClient = useQueryClient();
  const { effectiveUserId } = useImpersonation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', image_url: '' });
  const [drawerCollection, setDrawerCollection] = useState<CollectionRow | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(() => {
    try {
      return localStorage.getItem('collections-show-analytics') === '1';
    } catch {
      return false;
    }
  });

  const toggleAnalytics = (next: boolean) => {
    setShowAnalytics(next);
    try {
      localStorage.setItem('collections-show-analytics', next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const { data: rawCollections, isLoading } = useQuery({
    queryKey: ['collections', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collections')
        .select('*')
        .eq('user_id', effectiveUserId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-collections', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, sku, price, category, stock')
        .eq('user_id', effectiveUserId!)
        .order('title');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: productCollections = [] } = useQuery({
    queryKey: ['product-collections-map', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { data: tenantProducts, error: productsError } = await supabase
        .from('products')
        .select('id')
        .eq('user_id', effectiveUserId!);
      if (productsError) throw productsError;
      const productIds = (tenantProducts || []).map((p) => p.id);
      if (productIds.length === 0) return [];

      const { data, error } = await supabase
        .from('product_collections')
        .select('product_id, collection_id, created_at')
        .in('product_id', productIds);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: orderItems = [] } = useQuery({
    queryKey: ['order-items-for-collections', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      const { data: tenantProducts, error: productsError } = await supabase
        .from('products')
        .select('id')
        .eq('user_id', effectiveUserId!);
      if (productsError) throw productsError;
      const productIds = (tenantProducts || []).map((p) => p.id);
      if (productIds.length === 0) return [];

      const { data, error } = await supabase
        .from('order_items')
        .select('product_id, quantity, price')
        .in('product_id', productIds);
      if (error) throw error;
      return data || [];
    },
  });

  const productById = useMemo(() => {
    const map = new Map<string, (typeof products)[0]>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const revenueByProduct = useMemo(() => {
    const map = new Map<string, { revenue: number; units: number }>();
    for (const item of orderItems) {
      if (!item.product_id) continue;
      const prev = map.get(item.product_id) || { revenue: 0, units: 0 };
      prev.revenue += Number(item.price || 0) * Number(item.quantity || 0);
      prev.units += Number(item.quantity || 0);
      map.set(item.product_id, prev);
    }
    return map;
  }, [orderItems]);

  const collections: CollectionRow[] = useMemo(() => {
    if (!rawCollections) return [];
    return rawCollections.map((c) => {
      const links = productCollections.filter((pc) => pc.collection_id === c.id);
      const productIds = links.map((l) => l.product_id);
      let inventory_value = 0;
      let revenue = 0;
      for (const pid of productIds) {
        const p = productById.get(pid);
        if (p) {
          inventory_value += Number(p.price || 0) * Math.max(0, Number(p.stock || 0));
        }
        const sales = revenueByProduct.get(pid);
        if (sales) revenue += sales.revenue;
      }
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        image_url: c.image_url,
        created_at: c.created_at,
        updated_at: c.updated_at,
        product_count: productIds.length,
        inventory_value,
        revenue,
      };
    });
  }, [rawCollections, productCollections, productById, revenueByProduct]);

  // Keep open drawer metrics in sync after refetch
  const drawerCollectionSynced = useMemo(() => {
    if (!drawerCollection) return null;
    return collections.find((c) => c.id === drawerCollection.id) || drawerCollection;
  }, [collections, drawerCollection]);

  const kpis = useMemo(() => {
    const total = collections.length;
    const assignedSet = new Set(
      productCollections.map((pc) => pc.product_id)
    );
    const empty = collections.filter((c) => c.product_count === 0).length;
    const largest = collections.reduce(
      (best, c) => (c.product_count > best.product_count ? c : best),
      { name: '—', product_count: 0 } as { name: string; product_count: number }
    );
    const avg =
      total === 0 ? 0 : collections.reduce((s, c) => s + c.product_count, 0) / total;
    return {
      total,
      productsAssigned: assignedSet.size,
      largestName: largest.name,
      largestCount: largest.product_count,
      empty,
      avg: Math.round(avg * 10) / 10,
      totalRevenue: collections.reduce((s, c) => s + c.revenue, 0),
      totalInventory: collections.reduce((s, c) => s + c.inventory_value, 0),
    };
  }, [collections, productCollections]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = collections;
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q)
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'product_count':
          return (a.product_count - b.product_count) * dir;
        case 'inventory_value':
          return (a.inventory_value - b.inventory_value) * dir;
        case 'revenue':
          return (a.revenue - b.revenue) * dir;
        case 'updated_at':
        default:
          return (
            (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
          );
      }
    });
    return list;
  }, [collections, searchQuery, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const rows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const assignedIdsForDrawer = useMemo(() => {
    if (!drawerCollectionSynced) return [];
    return productCollections
      .filter((pc) => pc.collection_id === drawerCollectionSynced.id)
      .map((pc) => pc.product_id);
  }, [drawerCollectionSynced, productCollections]);

  const bestSellersForDrawer = useMemo(() => {
    if (!drawerCollectionSynced) return [];
    const ids = new Set(assignedIdsForDrawer);
    return [...ids]
      .map((id) => {
        const p = productById.get(id);
        const sales = revenueByProduct.get(id) || { revenue: 0, units: 0 };
        return {
          id,
          title: p?.title || tCommon('unknown'),
          units: sales.units,
          revenue: sales.revenue,
        };
      })
      .filter((b) => b.units > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [drawerCollectionSynced, assignedIdsForDrawer, productById, revenueByProduct]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof createForm) => {
      const userId =
        effectiveUserId ||
        (await resolveTenantUserId(async () => (await supabase.auth.getUser()).data.user?.id));
      const { data: result, error } = await supabase
        .from('collections')
        .insert([{ ...data, user_id: userId }])
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: (result) => {
      toast.success(tCollections('toast.created'));
      setIsCreateOpen(false);
      setCreateForm({ name: '', description: '', image_url: '' });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      if (result) {
        setDrawerCollection({
          id: result.id,
          name: result.name,
          description: result.description,
          image_url: result.image_url,
          created_at: result.created_at,
          updated_at: result.updated_at,
          product_count: 0,
          inventory_value: 0,
          revenue: 0,
        });
      }
    },
    onError: (error: any) => {
      toast.error(tCollections('toast.createFailed', { message: error.message }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('product_collections').delete().eq('collection_id', id);
      const { error } = await supabase.from('collections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tCollections('toast.deleted'));
      setDrawerCollection(null);
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['product-collections-map'] });
    },
    onError: (error: any) => {
      toast.error(tCollections('toast.deleteFailed', { message: error.message }));
    },
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const SortHead = ({ label, k }: { label: string; k: SortKey }) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => toggleSort(k)}
    >
      {label}
      <ArrowUpDown className={cn('h-3.5 w-3.5', sortKey === k && 'text-foreground')} />
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Folder className="h-6 w-6" />
            {tCollections('title')}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {tCollections('subtitle')}
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {tCollections('createCollection')}
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {tCollections('section.overview')}
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard title={tCollections('kpi.total')} value={String(kpis.total)} subtitle={tCollections('kpi.totalSub')} icon={Folder} />
          <KpiCard
            title={tCollections('kpi.productsAssigned')}
            value={String(kpis.productsAssigned)}
            subtitle={tCollections('kpi.productsAssignedSub')}
            icon={Package}
          />
          <KpiCard
            title={tCollections('kpi.largest')}
            value={String(kpis.largestCount)}
            subtitle={kpis.largestName}
            icon={FolderOpen}
          />
          <KpiCard title={tCollections('kpi.empty')} value={String(kpis.empty)} subtitle={tCollections('kpi.emptySub')} icon={Folder} />
          <KpiCard
            title={tCollections('kpi.avgProducts')}
            value={String(kpis.avg)}
            subtitle={tCollections('kpi.avgProductsSub')}
            icon={TrendingUp}
          />
        </div>
        {showAnalytics && (
          <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
            <KpiCard
              title={tCollections('kpi.inventoryValue')}
              value={formatRon(kpis.totalInventory)}
              subtitle={tCollections('kpi.inventoryValueSub')}
              icon={Wallet}
            />
            <KpiCard
              title={tCollections('kpi.revenue')}
              value={formatRon(kpis.totalRevenue)}
              subtitle={tCollections('kpi.revenueSub')}
              icon={TrendingUp}
            />
          </div>
        )}
      </section>

      <Collapsible open={showAnalytics} onOpenChange={toggleAnalytics}>
        <CollapsibleContent className="space-y-4">
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{tCollections('analytics.topByRevenue')}</CardTitle>
              <CardDescription>{tCollections('analytics.topByRevenueDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...collections]
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left text-sm flex justify-between gap-2 hover:underline"
                    onClick={() => setDrawerCollection(c)}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="text-muted-foreground shrink-0">{formatRon(c.revenue)}</span>
                  </button>
                ))}
              {!collections.some((c) => c.revenue > 0) && (
                <p className="text-sm text-muted-foreground">{tCollections('analytics.noRevenueYet')}</p>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder={tCollections('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {tCollections('count', { count: filtered.length })}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-16 flex flex-col items-center text-center gap-4">
            <div className="rounded-full bg-muted p-4">
              <FolderOpen className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="text-lg font-semibold">
                {searchQuery ? tCollections('empty.search') : tCollections('empty.createFirst')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? tCollections('empty.searchHint')
                  : tCollections('empty.createFirstHint')}
              </p>
            </div>
            {!searchQuery && (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {tCollections('createCollection')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[56px]" />
                  <TableHead>
                    <SortHead label={tCollections('table.collection')} k="name" />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHead label={tCollections('table.products')} k="product_count" />
                  </TableHead>
                  <TableHead className="text-right hidden md:table-cell">
                    <SortHead label={tCollections('table.inventory')} k="inventory_value" />
                  </TableHead>
                  <TableHead className="text-right hidden lg:table-cell">
                    <SortHead label={tCollections('table.revenue')} k="revenue" />
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <SortHead label={tCollections('table.updated')} k="updated_at" />
                  </TableHead>
                  <TableHead className="text-right">{tCommon('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => setDrawerCollection(c)}
                  >
                    <TableCell>
                      <div className="h-10 w-10 rounded-md overflow-hidden bg-muted flex items-center justify-center border">
                        {c.image_url ? (
                          <img src={c.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Folder className="h-4 w-4 text-muted-foreground/50" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      {c.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                          {c.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge variant="secondary">{c.product_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden md:table-cell">
                      {formatRon(c.inventory_value)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden lg:table-cell">
                      {formatRon(c.revenue)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {formatShortDate(c.updated_at)}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setDrawerCollection(c)}
                        >
                          {tCommon('edit')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(tCollections('confirm.delete', { name: c.name }))) deleteMutation.mutate(c.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {tCollections('pageOf', { page: pageSafe, total: totalPages })}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageSafe <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {tCommon('previous')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageSafe >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                {tCommon('next')}
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tCollections('createDialog.title')}</DialogTitle>
            <DialogDescription>{tCollections('createDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{tCommon('name')}</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder={tCollections('createDialog.namePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{tCommon('description')}</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              type="button"
              disabled={!createForm.name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate(createForm)}
            >
              {createMutation.isPending ? tCollections('creating') : tCollections('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CollectionEditorDrawer
        collection={drawerCollectionSynced}
        open={!!drawerCollection}
        onOpenChange={(o) => {
          if (!o) setDrawerCollection(null);
        }}
        products={products.map((p) => ({
          id: p.id,
          title: p.title,
          sku: p.sku,
          price: Number(p.price),
          category: p.category,
        }))}
        assignedProductIds={assignedIdsForDrawer}
        bestSellers={bestSellersForDrawer}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['collections'] });
          queryClient.invalidateQueries({ queryKey: ['product-collections-map'] });
        }}
        onDeleted={(id) => deleteMutation.mutate(id)}
      />
    </div>
  );
};

export default CollectionsManagement;
