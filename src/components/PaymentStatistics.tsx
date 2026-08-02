import { lazy, Suspense, useMemo, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Lightbulb,
  Minus,
  Package,
  RefreshCcw,
  ShoppingBag,
  Timer,
  TrendingUp,
  Wallet,
  XCircle,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangeFilter, useDateRangeFilter } from '@/components/DateRangeFilter';
import { PendingCheckoutsSection } from '@/components/PendingCheckoutsSection';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  buildPaymentAnalytics,
  formatPct,
  formatRon,
  isCashOrder,
  previousPeriod,
  type AnalyticsCheckoutSession,
  type AnalyticsOrder,
  type AnalyticsTransaction,
} from '@/lib/paymentAnalytics';
import { cn } from '@/lib/utils';

const PaymentTrendsCharts = lazy(() => import('@/components/PaymentTrendsCharts'));

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
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  delta?: number;
  accent?: string;
}) {
  return (
    <Card className="border-border/60 bg-gradient-to-br from-background to-muted/30 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
          {title}
        </CardTitle>
        <div className={cn('rounded-md p-1.5 bg-muted/80', accent)}>
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

function paymentMethodLabel(order: AnalyticsOrder) {
  return isCashOrder(order) ? 'Cash' : 'Card';
}

function paymentStatusBadge(order: AnalyticsOrder) {
  const status = order.payment_status;
  switch (status) {
    case 'paid':
    case 'invoiced':
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0">Paid</Badge>;
    case 'cash':
      return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0">Cash</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-0">Pending</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'refunded':
      return <Badge className="bg-slate-200 text-slate-700 hover:bg-slate-200 border-0">Refunded</Badge>;
    case 'cancelled':
      return <Badge className="bg-slate-200 text-slate-600 hover:bg-slate-200 border-0">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

const PaymentStatistics = () => {
  const { user } = useAuth();
  const { dateRange, setDateRange, preset, setPreset } = useDateRangeFilter('30days');
  const prevRange = useMemo(() => previousPeriod(dateRange), [dateRange]);

  const { data, isLoading } = useQuery({
    queryKey: [
      'payment-analytics',
      user?.id,
      dateRange.from.toISOString(),
      dateRange.to.toISOString(),
    ],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const fromIso = dateRange.from.toISOString();
      const toIso = dateRange.to.toISOString();
      const prevFrom = prevRange.from.toISOString();
      const prevTo = prevRange.to.toISOString();

      const [
        ordersRes,
        prevOrdersRes,
        txRes,
        prevTxRes,
        sessionsRes,
        prevSessionsRes,
      ] = await Promise.all([
        supabase
          .from('orders')
          .select(
            'id, customer_name, customer_email, total, payment_status, shipping_status, order_status, checkout_session_id, created_at'
          )
          .eq('user_id', user!.id)
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select(
            'id, customer_name, customer_email, total, payment_status, shipping_status, order_status, checkout_session_id, created_at'
          )
          .eq('user_id', user!.id)
          .gte('created_at', prevFrom)
          .lte('created_at', prevTo),
        supabase
          .from('payment_transactions')
          .select('*')
          .eq('user_id', user!.id)
          .gte('created_at', fromIso)
          .lte('created_at', toIso),
        supabase
          .from('payment_transactions')
          .select('*')
          .eq('user_id', user!.id)
          .gte('created_at', prevFrom)
          .lte('created_at', prevTo),
        supabase
          .from('checkout_sessions' as any)
          .select(
            'id, status, payment_status, total, customer_name, customer_email, created_at, expires_at, updated_at, order_id'
          )
          .eq('user_id', user!.id)
          .gte('created_at', fromIso)
          .lte('created_at', toIso),
        supabase
          .from('checkout_sessions' as any)
          .select(
            'id, status, payment_status, total, customer_name, customer_email, created_at, expires_at, updated_at, order_id'
          )
          .eq('user_id', user!.id)
          .gte('created_at', prevFrom)
          .lte('created_at', prevTo),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (prevOrdersRes.error) throw prevOrdersRes.error;
      if (txRes.error) throw txRes.error;
      if (prevTxRes.error) throw prevTxRes.error;
      // checkout_sessions may be missing on older clients — treat as empty
      const sessions = (sessionsRes.error ? [] : sessionsRes.data || []) as unknown as AnalyticsCheckoutSession[];
      const prevSessions = (prevSessionsRes.error
        ? []
        : prevSessionsRes.data || []) as unknown as AnalyticsCheckoutSession[];

      return {
        orders: (ordersRes.data || []) as AnalyticsOrder[],
        prevOrders: (prevOrdersRes.data || []) as AnalyticsOrder[],
        transactions: (txRes.data || []) as AnalyticsTransaction[],
        prevTransactions: (prevTxRes.data || []) as AnalyticsTransaction[],
        sessions,
        prevSessions,
      };
    },
  });

  const analytics = useMemo(() => {
    if (!data) return null;
    return buildPaymentAnalytics({
      range: dateRange,
      orders: data.orders,
      prevOrders: data.prevOrders,
      transactions: data.transactions,
      prevTransactions: data.prevTransactions,
      sessions: data.sessions,
      prevSessions: data.prevSessions,
    });
  }, [data, dateRange]);

  const funnelMax = useMemo(() => {
    if (!analytics) return 1;
    return Math.max(
      1,
      analytics.funnel.ordersCreated,
      analytics.funnel.paymentStarted,
      analytics.funnel.paymentCompleted,
      analytics.funnel.paymentFailed,
      analytics.funnel.abandonedPayment
    );
  }, [analytics]);

  if (isLoading || !analytics) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-3 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24 mb-2" />
                <Skeleton className="h-3 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const funnelSteps = [
    { key: 'ordersCreated', label: 'Orders Created', value: analytics.funnel.ordersCreated },
    { key: 'paymentStarted', label: 'Payment Started', value: analytics.funnel.paymentStarted },
    { key: 'paymentCompleted', label: 'Payment Completed', value: analytics.funnel.paymentCompleted },
    { key: 'paymentFailed', label: 'Payment Failed', value: analytics.funnel.paymentFailed },
    { key: 'abandonedPayment', label: 'Abandoned Payment', value: analytics.funnel.abandonedPayment },
  ] as const;

  const statItems = [
    { label: 'Highest Order Value', value: formatRon(analytics.stats.highest) },
    { label: 'Lowest Order Value', value: formatRon(analytics.stats.lowest) },
    { label: 'Average Order Value', value: formatRon(analytics.stats.aov) },
    { label: 'Median Order Value', value: formatRon(analytics.stats.median) },
    { label: 'Most Used Payment Method', value: analytics.stats.mostUsedMethod },
    { label: 'Payment Conversion Rate', value: formatPct(analytics.stats.conversionRate) },
    {
      label: 'Average Time To Pay (card)',
      value:
        analytics.stats.avgTimeToPayMinutes == null
          ? '—'
          : `${Math.round(analytics.stats.avgTimeToPayMinutes)} min`,
    },
    { label: 'Pending Payment Count', value: String(analytics.stats.pendingPaymentCount) },
    { label: 'Expired Checkout Sessions', value: String(analytics.stats.expiredSessions) },
    { label: 'Successful Card Payments', value: String(analytics.stats.successfulCard) },
    { label: 'Cancelled Card Payments', value: String(analytics.stats.cancelledCard) },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Payments</h2>
          <p className="text-sm text-muted-foreground">
            Revenue, conversion, and payment health for your store
          </p>
        </div>
        <DateRangeFilter
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          preset={preset}
          onPresetChange={setPreset}
        />
      </div>

      {/* Section 1 — KPI Cards */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Overview
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-3">
          <KpiCard
            title="Total Revenue"
            value={formatRon(analytics.totalRevenue)}
            subtitle="Completed orders"
            icon={Wallet}
            delta={analytics.deltas.revenue}
          />
          <KpiCard
            title="Total Orders"
            value={String(analytics.totalOrders)}
            subtitle="In selected period"
            icon={ShoppingBag}
            delta={analytics.deltas.orders}
          />
          <KpiCard
            title="Average Order Value"
            value={formatRon(analytics.averageOrderValue)}
            subtitle="Per completed order"
            icon={TrendingUp}
            delta={analytics.deltas.aov}
          />
          <KpiCard
            title="Success Rate"
            value={formatPct(analytics.paymentSuccessRate)}
            subtitle="Completed vs failed/expired"
            icon={CheckCircle2}
            delta={analytics.deltas.successRate}
          />
          <KpiCard
            title="Pending Card"
            value={String(analytics.pendingCardCount)}
            subtitle={formatRon(analytics.pendingCardRevenue)}
            icon={Timer}
          />
          <KpiCard
            title="Failed Payments"
            value={String(analytics.failedPayments)}
            subtitle="Failed or cancelled attempts"
            icon={XCircle}
          />
          <KpiCard
            title="Refunded"
            value={String(analytics.refundedPayments)}
            subtitle={formatRon(analytics.refundedRevenue)}
            icon={RefreshCcw}
          />
        </div>
      </section>

      {/* Section 2 + 3 */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Payment Method Breakdown</CardTitle>
            <CardDescription>How customers prefer to pay</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-sky-700" />
                  <span className="font-medium">Card</span>
                </div>
                <span className="text-2xl font-semibold tabular-nums">
                  {formatPct(analytics.card.pctOrders, 0)}
                </span>
              </div>
              <Progress value={analytics.card.pctOrders} className="h-2" />
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="font-semibold tabular-nums">{analytics.card.orders}</div>
                  <div className="text-xs text-muted-foreground">orders</div>
                </div>
                <div>
                  <div className="font-semibold tabular-nums">{formatRon(analytics.card.revenue)}</div>
                  <div className="text-xs text-muted-foreground">revenue</div>
                </div>
                <div>
                  <div className="font-semibold tabular-nums">{formatRon(analytics.card.aov)}</div>
                  <div className="text-xs text-muted-foreground">AOV</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-amber-700" />
                  <span className="font-medium">Cash</span>
                </div>
                <span className="text-2xl font-semibold tabular-nums">
                  {formatPct(analytics.cash.pctOrders, 0)}
                </span>
              </div>
              <Progress value={analytics.cash.pctOrders} className="h-2" />
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="font-semibold tabular-nums">{analytics.cash.orders}</div>
                  <div className="text-xs text-muted-foreground">orders</div>
                </div>
                <div>
                  <div className="font-semibold tabular-nums">{formatRon(analytics.cash.revenue)}</div>
                  <div className="text-xs text-muted-foreground">revenue</div>
                </div>
                <div>
                  <div className="font-semibold tabular-nums">{formatRon(analytics.cash.aov)}</div>
                  <div className="text-xs text-muted-foreground">AOV</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Revenue Breakdown</CardTitle>
            <CardDescription>Where your money comes from</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  label: 'Revenue from Card',
                  value: analytics.card.revenue,
                  icon: CreditCard,
                  tone: 'from-sky-50 to-background',
                },
                {
                  label: 'Revenue from Cash',
                  value: analytics.cash.revenue,
                  icon: Banknote,
                  tone: 'from-amber-50 to-background',
                },
                {
                  label: 'Pending Revenue',
                  value: analytics.pendingCardRevenue,
                  icon: Timer,
                  tone: 'from-yellow-50 to-background',
                },
                {
                  label: 'Refunded Revenue',
                  value: analytics.refundedRevenue,
                  icon: RefreshCcw,
                  tone: 'from-slate-50 to-background',
                },
                {
                  label: 'Cancelled Revenue',
                  value: analytics.cancelledRevenue,
                  icon: AlertTriangle,
                  tone: 'from-rose-50 to-background',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className={cn(
                    'rounded-lg border border-border/60 bg-gradient-to-br p-3',
                    item.tone
                  )}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </div>
                  <div className="text-lg font-semibold tabular-nums">{formatRon(item.value)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Section 4 — Funnel */}
      <section>
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Payment Funnel</CardTitle>
            <CardDescription>Journey from checkout start to outcome</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {funnelSteps.map((step, index) => {
                const pct = funnelMax ? (step.value / funnelMax) * 100 : 0;
                const ofStarted =
                  analytics.funnel.paymentStarted > 0
                    ? (step.value / analytics.funnel.paymentStarted) * 100
                    : 0;
                return (
                  <div key={step.key} className="relative rounded-lg border bg-muted/20 p-4">
                    {index < funnelSteps.length - 1 && (
                      <div className="hidden md:block absolute top-1/2 -right-2 text-muted-foreground/50 text-lg leading-none z-10">
                        →
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mb-2">{step.label}</div>
                    <div className="text-2xl font-semibold tabular-nums">{step.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatPct(ofStarted, 0)} of started
                    </div>
                    <Progress value={pct} className="h-1.5 mt-3" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Section 9 — Insights (early for visibility) */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          Insights
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {analytics.insights.map((insight) => (
            <Card
              key={insight}
              className="border-border/60 bg-gradient-to-br from-muted/40 via-background to-background"
            >
              <CardContent className="pt-4 pb-4 flex gap-3 items-start">
                <div className="rounded-full bg-emerald-100 p-1.5 mt-0.5">
                  <Lightbulb className="h-3.5 w-3.5 text-emerald-700" />
                </div>
                <p className="text-sm leading-relaxed">{insight}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Section 7 — Trends (lazy) */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Trends
        </h3>
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
          <PaymentTrendsCharts trends={analytics.trends} />
        </Suspense>
      </section>

      {/* Section 6 — Analytics stats */}
      <section>
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Payment Analytics</CardTitle>
            <CardDescription>Detailed performance statistics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {statItems.map((item) => (
                <div key={item.label} className="rounded-lg border border-border/50 bg-muted/15 p-3">
                  <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                  <div className="text-base font-semibold tabular-nums">{item.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Section 5 — Recent Payments */}
      <section>
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Recent Payments</CardTitle>
            <CardDescription>Latest completed and cash orders</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.recentOrders.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No payments in this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.recentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div className="font-medium">{order.customer_name}</div>
                          <div className="text-xs text-muted-foreground">{order.customer_email}</div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">#{order.id.slice(-8)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{paymentMethodLabel(order)}</Badge>
                        </TableCell>
                        <TableCell>{paymentStatusBadge(order)}</TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {formatRon(Number(order.total))}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(order.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Section 8 — Pending Card Payments */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Live pending card payments
        </h3>
        <PendingCheckoutsSection />
      </section>
    </div>
  );
};

export default PaymentStatistics;
