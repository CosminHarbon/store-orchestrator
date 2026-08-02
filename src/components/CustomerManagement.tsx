import { lazy, Suspense, useMemo, useState, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  Lightbulb,
  Minus,
  RefreshCw,
  Search,
  ShoppingBag,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Activity,
  UserCheck,
  Repeat,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { DateRangeFilter, useDateRangeFilter } from '@/components/DateRangeFilter';
import {
  SEGMENT_LABELS,
  buildCustomerAnalytics,
  filterCustomers,
  formatPct,
  formatRon,
  type CustomerProfile,
  type CustomerSegment,
  type GrowthGranularity,
  type RawCustomerOrder,
} from '@/lib/customerAnalytics';
import { cn } from '@/lib/utils';

const CustomerTrendsCharts = lazy(() => import('@/components/CustomerTrendsCharts'));

const PAGE_SIZE = 10;

type SortKey =
  | 'name'
  | 'totalOrders'
  | 'totalSpent'
  | 'averageOrderValue'
  | 'lastOrderDate'
  | 'firstOrderDate';

function DeltaBadge({ value }: { value: number }) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.05) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        vs prior period
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        up ? 'text-emerald-600' : 'text-rose-600'
      )}
    >
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {up ? '+' : ''}
      {value.toFixed(1)}% vs prior
    </span>
  );
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
        {typeof delta === 'number' && <DeltaBadge value={delta} />}
      </CardContent>
    </Card>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function segmentBadge(segment: CustomerSegment) {
  const styles: Record<CustomerSegment, string> = {
    vip: 'bg-amber-100 text-amber-900 hover:bg-amber-100',
    loyal: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
    returning: 'bg-sky-100 text-sky-800 hover:bg-sky-100',
    new: 'bg-violet-100 text-violet-800 hover:bg-violet-100',
    one_time: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
    high_value: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
    at_risk: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
    inactive: 'bg-rose-100 text-rose-800 hover:bg-rose-100',
  };
  return (
    <Badge className={cn('border-0', styles[segment])}>{SEGMENT_LABELS[segment]}</Badge>
  );
}

function statusBadge(status: 'active' | 'inactive') {
  return status === 'active' ? (
    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0">Active</Badge>
  ) : (
    <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200 border-0">Inactive</Badge>
  );
}

function paymentBadge(status: string) {
  if (status === 'paid' || status === 'invoiced') {
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0">Paid</Badge>;
  }
  if (status === 'cash') {
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0">Cash</Badge>;
  }
  if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
  if (status === 'refunded') {
    return <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200 border-0">Refunded</Badge>;
  }
  return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-0">{status}</Badge>;
}

const CustomerManagement = () => {
  const { dateRange, setDateRange, preset, setPreset } = useDateRangeFilter('30days');
  const [granularity, setGranularity] = useState<GrowthGranularity>('daily');
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<CustomerSegment | 'all'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'card' | 'cash'>('all');
  const [orderCountFilter, setOrderCountFilter] = useState<'all' | '1' | '2-4' | '5+'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [spendMin, setSpendMin] = useState('');
  const [spendMax, setSpendMax] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('totalSpent');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CustomerProfile | null>(null);

  const { data: orders, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['customer-details'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error: qError } = await supabase
        .from('orders')
        .select(
          `
          id,
          customer_email,
          customer_name,
          customer_phone,
          customer_address,
          total,
          created_at,
          payment_status,
          shipping_status,
          order_status,
          order_items(
            product_title,
            quantity,
            product_price
          )
        `
        )
        .order('created_at', { ascending: false });

      if (qError) throw qError;
      return (data || []) as RawCustomerOrder[];
    },
  });

  const analytics = useMemo(() => {
    if (!orders) return null;
    return buildCustomerAnalytics({
      orders,
      range: dateRange,
      granularity,
    });
  }, [orders, dateRange, granularity]);

  const filtered = useMemo(() => {
    if (!analytics) return [];
    const list = filterCustomers(analytics.customers, {
      search: searchQuery,
      segment: segmentFilter,
      paymentMethod: paymentFilter,
      orderCount: orderCountFilter,
      spendMin: spendMin ? Number(spendMin) : null,
      spendMax: spendMax ? Number(spendMax) : null,
      status: statusFilter,
    });

    const sorted = [...list].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dir;
      }
      return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
    });
    return sorted;
  }, [
    analytics,
    searchQuery,
    segmentFilter,
    paymentFilter,
    orderCountFilter,
    spendMin,
    spendMax,
    statusFilter,
    sortKey,
    sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  if (isLoading || !analytics) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-3 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-3 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">Error loading customers: {(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Customers</h2>
          <p className="text-sm text-muted-foreground">
            CRM analytics and customer relationships for your store
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
            Refresh
          </Button>
          <DateRangeFilter
            dateRange={dateRange}
            onDateRangeChange={(r) => {
              setDateRange(r);
              setPage(1);
            }}
            preset={preset}
            onPresetChange={setPreset}
          />
        </div>
      </div>

      {/* KPIs */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Overview
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          <KpiCard
            title="Total Customers"
            value={String(analytics.kpis.totalCustomers)}
            subtitle="Unique emails with orders"
            icon={Users}
            delta={analytics.deltas.totalCustomers}
          />
          <KpiCard
            title="New Customers"
            value={String(analytics.kpis.newCustomers)}
            subtitle="First order in period"
            icon={UserPlus}
            delta={analytics.deltas.newCustomers}
          />
          <KpiCard
            title="Returning"
            value={String(analytics.kpis.returningCustomers)}
            subtitle="2+ lifetime orders"
            icon={Repeat}
          />
          <KpiCard
            title="Active"
            value={String(analytics.kpis.activeCustomers)}
            subtitle="Purchased in last 30 days"
            icon={UserCheck}
            delta={analytics.deltas.activeCustomers}
          />
          <KpiCard
            title="Customer Growth"
            value={formatPct(analytics.kpis.growthPct)}
            subtitle="Roster growth vs prior"
            icon={TrendingUp}
          />
          <KpiCard
            title="Avg Lifetime Value"
            value={formatRon(analytics.kpis.averageLtv)}
            subtitle="Spend per customer"
            icon={Wallet}
          />
          <KpiCard
            title="Avg Orders / Customer"
            value={analytics.kpis.averageOrdersPerCustomer.toFixed(1)}
            subtitle="Lifetime order count"
            icon={ShoppingBag}
          />
          <KpiCard
            title="Avg Spend / Customer"
            value={formatRon(analytics.kpis.averageSpendPerCustomer)}
            subtitle="Same as LTV for now"
            icon={Activity}
          />
        </div>
      </section>

      {/* Insights */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          Customer Insights
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {analytics.insights.map((insight) => (
            <Card
              key={insight}
              className="border-border/60 bg-gradient-to-br from-muted/40 via-background to-background"
            >
              <CardContent className="pt-4 pb-4 flex gap-3 items-start">
                <div className="rounded-full bg-sky-100 p-1.5 mt-0.5">
                  <Lightbulb className="h-3.5 w-3.5 text-sky-700" />
                </div>
                <p className="text-sm leading-relaxed">{insight}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Segments */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Customer Segments
          </h3>
          {segmentFilter !== 'all' && (
            <Button variant="ghost" size="sm" onClick={() => setSegmentFilter('all')}>
              Clear segment filter
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {analytics.segments.map((seg) => (
            <button
              key={seg.key}
              type="button"
              onClick={() => {
                setSegmentFilter(seg.key);
                setPage(1);
              }}
              className={cn(
                'text-left rounded-lg border p-3 transition-colors bg-gradient-to-br from-background to-muted/20',
                segmentFilter === seg.key
                  ? 'border-foreground/30 ring-1 ring-foreground/10'
                  : 'border-border/60 hover:bg-muted/30'
              )}
            >
              <div className="mb-2">{segmentBadge(seg.key)}</div>
              <div className="text-2xl font-semibold tabular-nums">{seg.count}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatRon(seg.revenue)} revenue
              </div>
              <div className="text-xs text-muted-foreground">
                Avg {formatRon(seg.averageSpend)}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Charts */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Growth & Charts
          </h3>
          <Select
            value={granularity}
            onValueChange={(v) => setGranularity(v as GrowthGranularity)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Suspense
          fallback={
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="h-[260px] flex items-center justify-center">
                    <Skeleton className="h-40 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          }
        >
          <CustomerTrendsCharts analytics={analytics} />
        </Suspense>
      </section>

      {/* Filters + Table */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Customer Directory
        </h3>
        <Card className="border-border/60">
          <CardHeader className="pb-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, email, phone, or order ID..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
              <Select
                value={segmentFilter}
                onValueChange={(v) => {
                  setSegmentFilter(v as CustomerSegment | 'all');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Segment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All segments</SelectItem>
                  {(Object.keys(SEGMENT_LABELS) as CustomerSegment[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {SEGMENT_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={paymentFilter}
                onValueChange={(v) => {
                  setPaymentFilter(v as 'all' | 'card' | 'cash');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={orderCountFilter}
                onValueChange={(v) => {
                  setOrderCountFilter(v as 'all' | '1' | '2-4' | '5+');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Orders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any order count</SelectItem>
                  <SelectItem value="1">1 order</SelectItem>
                  <SelectItem value="2-4">2–4 orders</SelectItem>
                  <SelectItem value="5+">5+ orders</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v as 'all' | 'active' | 'inactive');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Min spend"
                value={spendMin}
                onChange={(e) => {
                  setSpendMin(e.target.value);
                  setPage(1);
                }}
              />
              <Input
                type="number"
                placeholder="Max spend"
                value={spendMax}
                onChange={(e) => {
                  setSpendMax(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground space-y-2">
                <Users className="h-12 w-12 mx-auto opacity-40" />
                <p className="font-medium text-foreground">No customers match your filters</p>
                <p className="text-sm max-w-md mx-auto">
                  Try clearing search or filters. Customers appear automatically when they place
                  their first order.
                </p>
              </div>
            ) : (
              <>
                <div className="hidden lg:block overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <button type="button" onClick={() => toggleSort('name')}>
                            Customer
                          </button>
                        </TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>
                          <button type="button" onClick={() => toggleSort('totalOrders')}>
                            Orders
                          </button>
                        </TableHead>
                        <TableHead>
                          <button type="button" onClick={() => toggleSort('totalSpent')}>
                            Spent
                          </button>
                        </TableHead>
                        <TableHead>
                          <button type="button" onClick={() => toggleSort('averageOrderValue')}>
                            AOV
                          </button>
                        </TableHead>
                        <TableHead>
                          <button type="button" onClick={() => toggleSort('lastOrderDate')}>
                            Last Order
                          </button>
                        </TableHead>
                        <TableHead>
                          <button type="button" onClick={() => toggleSort('firstOrderDate')}>
                            Since
                          </button>
                        </TableHead>
                        <TableHead>Segment</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((customer) => (
                        <TableRow
                          key={customer.email}
                          className="cursor-pointer"
                          onClick={() => setSelected(customer)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className="text-xs font-medium">
                                  {initials(customer.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{customer.name}</div>
                                <div className="text-xs text-muted-foreground lg:hidden">
                                  {customer.email}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>{customer.email}</div>
                            <div className="text-muted-foreground">{customer.phone || '—'}</div>
                          </TableCell>
                          <TableCell className="tabular-nums">{customer.totalOrders}</TableCell>
                          <TableCell className="font-medium tabular-nums">
                            {formatRon(customer.totalSpent)}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {formatRon(customer.averageOrderValue)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(customer.lastOrderDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(customer.firstOrderDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>{segmentBadge(customer.primarySegment)}</TableCell>
                          <TableCell>{statusBadge(customer.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="lg:hidden space-y-3">
                  {pageRows.map((customer) => (
                    <button
                      key={customer.email}
                      type="button"
                      onClick={() => setSelected(customer)}
                      className="w-full text-left rounded-lg border border-border/60 p-3 bg-gradient-to-br from-background to-muted/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>{initials(customer.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{customer.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {customer.email}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold tabular-nums">
                            {formatRon(customer.totalSpent)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {customer.totalOrders} orders
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {segmentBadge(customer.primarySegment)}
                        {statusBadge(customer.status)}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(pageSafe - 1) * PAGE_SIZE + 1}–
                    {Math.min(pageSafe * PAGE_SIZE, filtered.length)} of {filtered.length}
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pageSafe <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
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
          </CardContent>
        </Card>
      </section>

      {/* Detail Drawer */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="text-left space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="text-sm font-semibold">
                      {initials(selected.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle>{selected.name}</SheetTitle>
                    <SheetDescription>{selected.email}</SheetDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {segmentBadge(selected.primarySegment)}
                  {statusBadge(selected.status)}
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <section>
                  <h4 className="text-sm font-medium mb-3">Profile</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Stat label="Phone" value={selected.phone || '—'} />
                    <Stat
                      label="Customer since"
                      value={new Date(selected.firstOrderDate).toLocaleDateString()}
                    />
                    <Stat label="Total orders" value={String(selected.totalOrders)} />
                    <Stat label="Total revenue" value={formatRon(selected.totalSpent)} />
                    <Stat label="Average order" value={formatRon(selected.averageOrderValue)} />
                    <Stat label="Lifetime value" value={formatRon(selected.totalSpent)} />
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-medium mb-3">Statistics</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Stat
                      label="Products purchased"
                      value={String(selected.totalProductsPurchased)}
                    />
                    <Stat
                      label="Favorite payment"
                      value={selected.favoritePaymentMethod}
                    />
                    <Stat
                      label="Favorite categories"
                      value={selected.favoriteCategories.join(', ') || '—'}
                    />
                    <Stat
                      label="Avg days between orders"
                      value={
                        selected.avgDaysBetweenOrders == null
                          ? '—'
                          : `${Math.round(selected.avgDaysBetweenOrders)} days`
                      }
                    />
                    <Stat
                      label="Last purchase"
                      value={new Date(selected.lastOrderDate).toLocaleDateString()}
                    />
                    <Stat
                      label="Days since last purchase"
                      value={String(selected.daysSinceLastOrder)}
                    />
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-medium mb-3">Recent Orders</h4>
                  <div className="space-y-2">
                    {selected.orders.slice(0, 8).map((order) => (
                      <div key={order.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex justify-between gap-2">
                          <div>
                            <div className="font-medium">#{order.id.slice(-8)}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(order.created_at).toLocaleString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold tabular-nums">
                              {formatRon(Number(order.total))}
                            </div>
                            <div className="flex gap-1 justify-end mt-1">
                              {paymentBadge(order.payment_status)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-medium mb-3">Activity Timeline</h4>
                  <div className="space-y-3 border-l pl-4 ml-1">
                    <TimelineItem
                      title="Customer created"
                      detail={new Date(selected.firstOrderDate).toLocaleString()}
                    />
                    {selected.orders.slice(0, 6).map((order) => (
                      <TimelineItem
                        key={`tl-${order.id}`}
                        title={`Order placed · ${formatRon(Number(order.total))}`}
                        detail={`${new Date(order.created_at).toLocaleString()} · ${
                          order.payment_status === 'cash' ? 'Cash' : 'Card'
                        }`}
                      />
                    ))}
                    {selected.orders
                      .filter((o) => o.payment_status === 'paid' || o.payment_status === 'cash')
                      .slice(0, 3)
                      .map((order) => (
                        <TimelineItem
                          key={`pay-${order.id}`}
                          title="Payment completed"
                          detail={`Order #${order.id.slice(-8)} · ${order.payment_status}`}
                        />
                      ))}
                    {selected.orders
                      .filter((o) => o.payment_status === 'refunded')
                      .map((order) => (
                        <TimelineItem
                          key={`ref-${order.id}`}
                          title="Refund recorded"
                          detail={`Order #${order.id.slice(-8)}`}
                        />
                      ))}
                    <TimelineItem
                      title="Last activity"
                      detail={new Date(selected.lastOrderDate).toLocaleString()}
                    />
                  </div>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium mt-0.5 break-words">{value}</div>
    </div>
  );
}

function TimelineItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="relative">
      <div className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-sky-500/80 border-2 border-background" />
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

export default CustomerManagement;
