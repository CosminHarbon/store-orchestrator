import { useMemo, useState, type ComponentType } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpDown,
  BarChart3,
  Calendar,
  ChevronDown,
  Copy,
  Percent,
  Plus,
  Search,
  Tag,
  Trash2,
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
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  DiscountEditorDrawer,
  deriveDiscountStatus,
  statusBadgeClass,
  type DiscountLifecycle,
  type DiscountRow,
} from './DiscountEditorDrawer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatRon } from '@/lib/paymentAnalytics';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type SortKey =
  | 'name'
  | 'discount_value'
  | 'product_count'
  | 'status'
  | 'start_date'
  | 'end_date'
  | 'updated_at';

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

function formatDiscountValue(d: Pick<DiscountRow, 'discount_type' | 'discount_value'>) {
  if (d.discount_type === 'percentage') return `${d.discount_value}%`;
  return formatRon(d.discount_value);
}

const DiscountManagement = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DiscountLifecycle>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    discount_type: 'percentage' as 'percentage' | 'fixed_amount',
    discount_value: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    is_active: true,
  });
  const [createProductIds, setCreateProductIds] = useState<string[]>([]);
  const [createProductSearch, setCreateProductSearch] = useState('');
  const [drawerDiscount, setDrawerDiscount] = useState<DiscountRow | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(() => {
    try {
      return localStorage.getItem('discounts-show-analytics') === '1';
    } catch {
      return false;
    }
  });

  const toggleAnalytics = (next: boolean) => {
    setShowAnalytics(next);
    try {
      localStorage.setItem('discounts-show-analytics', next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const { data: rawDiscounts, isLoading } = useQuery({
    queryKey: ['discounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('discounts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-discounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, price, sku')
        .order('title');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: productDiscounts = [] } = useQuery({
    queryKey: ['product-discounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('product_discounts').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: orderItems = [] } = useQuery({
    queryKey: ['order-items-for-discounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('product_id, quantity, price, order_id');
      if (error) throw error;
      return data || [];
    },
  });

  const discounts: DiscountRow[] = useMemo(() => {
    if (!rawDiscounts) return [];
    return rawDiscounts.map((d) => {
      const count = productDiscounts.filter((pd) => pd.discount_id === d.id).length;
      const status = deriveDiscountStatus(d);
      return {
        id: d.id,
        name: d.name,
        description: d.description,
        discount_type: d.discount_type,
        discount_value: Number(d.discount_value),
        start_date: d.start_date,
        end_date: d.end_date,
        is_active: d.is_active,
        created_at: d.created_at,
        updated_at: (d as any).updated_at || d.created_at,
        product_count: count,
        status,
      };
    });
  }, [rawDiscounts, productDiscounts]);

  const drawerDiscountSynced = useMemo(() => {
    if (!drawerDiscount) return null;
    return discounts.find((d) => d.id === drawerDiscount.id) || drawerDiscount;
  }, [discounts, drawerDiscount]);

  const productById = useMemo(() => {
    const map = new Map<string, (typeof products)[0]>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const kpis = useMemo(() => {
    const active = discounts.filter((d) => d.status === 'active').length;
    const scheduled = discounts.filter((d) => d.status === 'scheduled').length;
    const expired = discounts.filter((d) => d.status === 'expired').length;
    const activeDiscountIds = new Set(
      discounts.filter((d) => d.status === 'active').map((d) => d.id)
    );
    const productsOnDiscount = new Set(
      productDiscounts
        .filter((pd) => activeDiscountIds.has(pd.discount_id))
        .map((pd) => pd.product_id)
    );
    const pctDiscounts = discounts.filter((d) => d.discount_type === 'percentage');
    const avgPct =
      pctDiscounts.length === 0
        ? 0
        : pctDiscounts.reduce((s, d) => s + d.discount_value, 0) / pctDiscounts.length;

    let estimatedDiscounted = 0;
    for (const d of discounts.filter((x) => x.status === 'active')) {
      const pids = productDiscounts
        .filter((pd) => pd.discount_id === d.id)
        .map((pd) => pd.product_id);
      for (const pid of pids) {
        const p = productById.get(pid);
        if (!p) continue;
        const price = Number(p.price || 0);
        if (d.discount_type === 'percentage') {
          estimatedDiscounted += price * (d.discount_value / 100);
        } else {
          estimatedDiscounted += Math.min(price, d.discount_value);
        }
      }
    }

    return {
      active,
      scheduled,
      expired,
      productsOnDiscount: productsOnDiscount.size,
      avgPct: Math.round(avgPct * 10) / 10,
      estimatedDiscounted,
    };
  }, [discounts, productDiscounts, productById]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = discounts;
    if (statusFilter !== 'all') {
      list = list.filter((d) => d.status === statusFilter);
    }
    if (q) {
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q)
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    const statusRank = (s: DiscountLifecycle) =>
      s === 'active' ? 0 : s === 'scheduled' ? 1 : 2;
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'discount_value':
          return (a.discount_value - b.discount_value) * dir;
        case 'product_count':
          return (a.product_count - b.product_count) * dir;
        case 'status':
          return (statusRank(a.status) - statusRank(b.status)) * dir;
        case 'start_date':
          return (
            (new Date(a.start_date).getTime() - new Date(b.start_date).getTime()) * dir
          );
        case 'end_date':
          return (
            (new Date(a.end_date || 0).getTime() - new Date(b.end_date || 0).getTime()) *
            dir
          );
        case 'updated_at':
        default:
          return (
            (new Date(a.updated_at || a.created_at).getTime() -
              new Date(b.updated_at || b.created_at).getTime()) *
            dir
          );
      }
    });
    return list;
  }, [discounts, searchQuery, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const rows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const assignedIdsForDrawer = useMemo(() => {
    if (!drawerDiscountSynced) return [];
    return productDiscounts
      .filter((pd) => pd.discount_id === drawerDiscountSynced.id)
      .map((pd) => pd.product_id);
  }, [drawerDiscountSynced, productDiscounts]);

  const performanceForDrawer = useMemo(() => {
    if (!drawerDiscountSynced) return null;
    const ids = new Set(assignedIdsForDrawer);
    if (!ids.size || !orderItems.length) return null;
    let revenue = 0;
    let units = 0;
    const orderIds = new Set<string>();
    for (const item of orderItems) {
      if (!item.product_id || !ids.has(item.product_id)) continue;
      revenue += Number(item.price || 0) * Number(item.quantity || 0);
      units += Number(item.quantity || 0);
      if (item.order_id) orderIds.add(item.order_id);
    }
    if (revenue === 0 && units === 0) return null;
    return { revenue, units, orders: orderIds.size };
  }, [drawerDiscountSynced, assignedIdsForDrawer, orderItems]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('discounts')
        .insert({
          name: createForm.name.trim(),
          description: createForm.description,
          discount_type: createForm.discount_type,
          discount_value: parseFloat(createForm.discount_value),
          user_id: (await supabase.auth.getUser()).data.user?.id,
          start_date: new Date(createForm.start_date).toISOString(),
          end_date: createForm.end_date
            ? new Date(createForm.end_date).toISOString()
            : null,
          is_active: createForm.is_active,
        })
        .select()
        .single();
      if (error) throw error;

      if (createProductIds.length > 0) {
        const { error: pdErr } = await supabase.from('product_discounts').insert(
          createProductIds.map((product_id) => ({
            product_id,
            discount_id: data.id,
          }))
        );
        if (pdErr) throw pdErr;
      }
      return data;
    },
    onSuccess: (data) => {
      toast.success('Discount created');
      setIsCreateOpen(false);
      setCreateForm({
        name: '',
        description: '',
        discount_type: 'percentage',
        discount_value: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        is_active: true,
      });
      setCreateProductIds([]);
      setCreateProductSearch('');
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      queryClient.invalidateQueries({ queryKey: ['product-discounts'] });
      if (data) {
        setDrawerDiscount({
          id: data.id,
          name: data.name,
          description: data.description,
          discount_type: data.discount_type,
          discount_value: Number(data.discount_value),
          start_date: data.start_date,
          end_date: data.end_date,
          is_active: data.is_active,
          created_at: data.created_at,
          updated_at: (data as any).updated_at || data.created_at,
          product_count: createProductIds.length,
          status: deriveDiscountStatus(data),
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to create discount');
      console.error(error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('product_discounts').delete().eq('discount_id', id);
      const { error } = await supabase.from('discounts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Discount deleted');
      setDrawerDiscount(null);
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      queryClient.invalidateQueries({ queryKey: ['product-discounts'] });
    },
    onError: (error) => {
      toast.error('Failed to delete discount');
      console.error(error);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const source = discounts.find((d) => d.id === id);
      if (!source) throw new Error('Discount not found');
      const { data, error } = await supabase
        .from('discounts')
        .insert({
          name: `${source.name} (Copy)`,
          description: source.description,
          discount_type: source.discount_type,
          discount_value: source.discount_value,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          start_date: source.start_date,
          end_date: source.end_date,
          is_active: source.is_active,
        })
        .select()
        .single();
      if (error) throw error;

      const sourceProducts = productDiscounts
        .filter((pd) => pd.discount_id === id)
        .map((pd) => pd.product_id);
      if (sourceProducts.length) {
        await supabase.from('product_discounts').insert(
          sourceProducts.map((product_id) => ({
            product_id,
            discount_id: data.id,
          }))
        );
      }
      return { data, productCount: sourceProducts.length };
    },
    onSuccess: ({ data, productCount }) => {
      toast.success('Discount duplicated');
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      queryClient.invalidateQueries({ queryKey: ['product-discounts'] });
      if (data) {
        setDrawerDiscount({
          id: data.id,
          name: data.name,
          description: data.description,
          discount_type: data.discount_type,
          discount_value: Number(data.discount_value),
          start_date: data.start_date,
          end_date: data.end_date,
          is_active: data.is_active,
          created_at: data.created_at,
          updated_at: (data as any).updated_at || data.created_at,
          product_count: productCount,
          status: deriveDiscountStatus(data),
        });
      }
    },
    onError: (error) => {
      toast.error('Failed to duplicate discount');
      console.error(error);
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

  const createSearchable = useMemo(() => {
    const q = createProductSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q)
      );
    });
  }, [products, createProductSearch]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Percent className="h-6 w-6" />
            Discounts
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Create promotions and assign them to products in your catalog.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Discount
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Overview
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => toggleAnalytics(!showAnalytics)}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
            <ChevronDown
              className={cn('h-4 w-4 ml-1 transition-transform', showAnalytics && 'rotate-180')}
            />
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard title="Active" value={String(kpis.active)} subtitle="Running now" icon={Tag} />
          <KpiCard
            title="Scheduled"
            value={String(kpis.scheduled)}
            subtitle="Starts later"
            icon={Calendar}
          />
          <KpiCard
            title="Expired"
            value={String(kpis.expired)}
            subtitle="Ended or inactive"
            icon={Calendar}
          />
          <KpiCard
            title="Products on Discount"
            value={String(kpis.productsOnDiscount)}
            subtitle="Active promotions"
            icon={Tag}
          />
          <KpiCard
            title="Avg Discount %"
            value={`${kpis.avgPct}%`}
            subtitle="Percentage discounts"
            icon={Percent}
          />
          <KpiCard
            title="Est. Revenue Discounted"
            value={formatRon(kpis.estimatedDiscounted)}
            subtitle="Per unit if all sold once"
            icon={Wallet}
          />
        </div>
      </section>

      <Collapsible open={showAnalytics} onOpenChange={toggleAnalytics}>
        <CollapsibleContent className="space-y-4">
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Status breakdown</CardTitle>
              <CardDescription>Derived from start/end dates and active flag</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {(['active', 'scheduled', 'expired'] as DiscountLifecycle[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="text-sm flex items-center gap-2 hover:underline"
                  onClick={() => {
                    setStatusFilter(s);
                    setPage(1);
                  }}
                >
                  <Badge className={statusBadgeClass(s)}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Badge>
                  <span className="tabular-nums text-muted-foreground">
                    {discounts.filter((d) => d.status === s).length}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search discounts…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v: 'all' | DiscountLifecycle) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground sm:ml-auto">
          {filtered.length} discount{filtered.length === 1 ? '' : 's'}
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
              <Percent className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="text-lg font-semibold">
                {searchQuery || statusFilter !== 'all'
                  ? 'No discounts match your filters'
                  : 'Create your first discount'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try clearing search or status filters.'
                  : 'Offer percentage or fixed-amount deals and assign them to products.'}
              </p>
            </div>
            {!searchQuery && statusFilter === 'all' && (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Discount
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
                  <TableHead>
                    <SortHead label="Discount" k="name" />
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">
                    <SortHead label="Value" k="discount_value" />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHead label="Products" k="product_count" />
                  </TableHead>
                  <TableHead>
                    <SortHead label="Status" k="status" />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <SortHead label="Start" k="start_date" />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <SortHead label="End" k="end_date" />
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    <SortHead label="Updated" k="updated_at" />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer"
                    onClick={() => setDrawerDiscount(d)}
                  >
                    <TableCell>
                      <div className="font-medium">{d.name}</div>
                      {d.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                          {d.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm capitalize">
                      {d.discount_type === 'percentage' ? 'Percentage' : 'Fixed'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatDiscountValue(d)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{d.product_count}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass(d.status)}>
                        {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {format(new Date(d.start_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {d.end_date ? format(new Date(d.end_date), 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {format(new Date(d.updated_at || d.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          title="Duplicate"
                          onClick={() => duplicateMutation.mutate(d.id)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setDrawerDiscount(d)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`Delete "${d.name}"?`)) deleteMutation.mutate(d.id);
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
              Page {pageSafe} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageSafe <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pageSafe >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create discount</DialogTitle>
            <DialogDescription>
              Set the offer details, then optionally assign products.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="e.g. Summer Sale"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={createForm.discount_type}
                  onValueChange={(v: 'percentage' | 'fixed_amount') =>
                    setCreateForm({ ...createForm, discount_type: v })
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
                <Label>Value</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={createForm.discount_value}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, discount_value: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input
                  type="date"
                  value={createForm.start_date}
                  onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input
                  type="date"
                  value={createForm.end_date}
                  onChange={(e) => setCreateForm({ ...createForm, end_date: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={createForm.is_active}
                onCheckedChange={(checked) =>
                  setCreateForm({ ...createForm, is_active: checked === true })
                }
              />
              Active when within schedule
            </label>
            <div className="space-y-2">
              <Label>Products (optional)</Label>
              <Input
                placeholder="Search products…"
                value={createProductSearch}
                onChange={(e) => setCreateProductSearch(e.target.value)}
              />
              <div className="rounded-md border max-h-40 overflow-y-auto divide-y">
                {createSearchable.slice(0, 40).map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/30"
                  >
                    <Checkbox
                      checked={createProductIds.includes(p.id)}
                      onCheckedChange={(checked) => {
                        setCreateProductIds((ids) =>
                          checked ? [...ids, p.id] : ids.filter((id) => id !== p.id)
                        );
                      }}
                    />
                    <span className="truncate">{p.title}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {createProductIds.length} selected
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !createForm.name.trim() ||
                !createForm.discount_value ||
                createMutation.isPending
              }
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiscountEditorDrawer
        discount={drawerDiscountSynced}
        open={!!drawerDiscount}
        onOpenChange={(o) => {
          if (!o) setDrawerDiscount(null);
        }}
        products={products.map((p) => ({
          id: p.id,
          title: p.title,
          price: Number(p.price),
          sku: p.sku,
        }))}
        assignedProductIds={assignedIdsForDrawer}
        performance={performanceForDrawer}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['discounts'] });
          queryClient.invalidateQueries({ queryKey: ['product-discounts'] });
        }}
        onDeleted={(id) => deleteMutation.mutate(id)}
        onDuplicated={(id) => duplicateMutation.mutate(id)}
      />
    </div>
  );
};

export default DiscountManagement;
