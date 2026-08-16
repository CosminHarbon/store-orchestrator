import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { format, startOfYear, subDays } from 'date-fns';
import { enUS, ro } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStoreOnboarding } from '@/hooks/useStoreOnboarding';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { isAppLanguage } from '@/i18n/types';
import {
  AlertTriangle,
  ArrowRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Package,
  Plus,
  ShoppingCart,
  Store,
  Truck,
} from 'lucide-react';
import '@/styles/dashboard-home.css';

const DashboardRevenueChart = lazy(() => import('./DashboardRevenueChart'));

type PerformanceRange = 'today' | '7d' | '30d' | '90d';
type PerformanceMetric = 'sales' | 'orders';
type ActivityPreset = 'today' | '3d' | '7d' | '14d' | '30d' | '90d' | 'year' | 'custom';

type ProductRow = {
  id: string;
  title: string;
  sku: string | null;
  stock: number;
  low_stock_threshold: number;
  image: string | null;
};

type OrderRow = {
  id: string;
  customer_name: string;
  customer_email: string;
  total: number;
  payment_status: string;
  shipping_status: string;
  order_status: string | null;
  awb_number: string | null;
  created_at: string;
  order_items?: Array<{ quantity: number | null }> | null;
};

type SessionRow = {
  id: string;
  total: number;
  expires_at: string;
  created_at: string;
  status: string;
};

type AbandonedRow = {
  id: string;
  estimated_total: number;
  last_activity_at: string;
  status: string;
};

interface DashboardHomeProps {
  onTabChange: (tab: string) => void;
  storeName?: string;
}

function performanceWindow(range: PerformanceRange) {
  const end = new Date();
  const start = new Date();

  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  const days = range === '7d' ? 6 : range === '30d' ? 29 : 89;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  return { start, end };
}

function activityWindow(preset: ActivityPreset, custom: { from: Date; to: Date }) {
  if (preset === 'custom') {
    const from = new Date(custom.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(custom.to);
    to.setHours(23, 59, 59, 999);
    return { start: from, end: to };
  }

  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  if (preset === 'today') return { start, end };
  if (preset === 'year') return { start: startOfYear(new Date()), end };

  const daysBack =
    preset === '3d' ? 2 : preset === '7d' ? 6 : preset === '14d' ? 13 : preset === '30d' ? 29 : 89;
  start.setDate(start.getDate() - daysBack);
  return { start, end };
}

function formatAgo(iso: string, t: (key: string, options?: Record<string, unknown>) => string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hours', { count: hours });
  const days = Math.floor(hours / 24);
  return t('time.days', { count: days });
}

function openOrderFromDashboard(orderId: string, onTabChange: (tab: string) => void) {
  try {
    localStorage.setItem('sv-open-order-id', orderId);
  } catch {
    /* ignore */
  }
  onTabChange('orders');
}

function greetingKeyForHour(hour = new Date().getHours()) {
  if (hour < 12) return 'header.greetingMorning';
  if (hour < 18) return 'header.greetingAfternoon';
  return 'header.greetingEvening';
}

export default function DashboardHome({ onTabChange, storeName }: DashboardHomeProps) {
  const { t, i18n } = useTranslation('dashboard');
  const { t: tOnboarding } = useTranslation('onboarding');
  const navigate = useNavigate();
  const onboarding = useStoreOnboarding();
  const { user } = useAuth();
  const [range, setRange] = useState<PerformanceRange>('7d');
  const [metric, setMetric] = useState<PerformanceMetric>('sales');
  const [activityPreset, setActivityPreset] = useState<ActivityPreset>('today');
  const [customRange, setCustomRange] = useState({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  const windowRange = useMemo(() => performanceWindow(range), [range]);
  const activityRange = useMemo(
    () => activityWindow(activityPreset, customRange),
    [activityPreset, customRange]
  );

  const lng = (i18n.resolvedLanguage || i18n.language || 'ro').split('-')[0];
  const dateLocale = isAppLanguage(lng) && lng === 'en' ? enUS : ro;

  const activityPeriodLabel = useMemo(() => {
    if (activityPreset === 'custom') {
      return `${format(customRange.from, 'd MMM', { locale: dateLocale })} – ${format(
        customRange.to,
        'd MMM yyyy',
        { locale: dateLocale }
      )}`;
    }
    return t(`activity.period.${activityPreset}`);
  }, [activityPreset, customRange, dateLocale, t]);

  const { data, isLoading } = useQuery({
    queryKey: [
      'dashboard-command-center',
      user?.id,
      range,
      activityPreset,
      activityRange.start.toISOString(),
      activityRange.end.toISOString(),
    ],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const orderFilter = 'order_status.is.null,order_status.neq.awaiting_payment';

      const [
        profileRes,
        productsRes,
        recentOrdersRes,
        activityOrdersRes,
        chartOrdersRes,
        attentionOrdersRes,
        pendingSessionsRes,
        abandonedRes,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'store_name, setup_completed, welcome_dismissed, netpopia_api_key, netpopia_signature, eawb_api_key'
          )
          .eq('user_id', user!.id)
          .single(),
        supabase
          .from('products')
          .select('id, title, sku, stock, low_stock_threshold, image', { count: 'exact' })
          .order('updated_at', { ascending: false }),
        supabase
          .from('orders')
          .select(
            'id, customer_name, customer_email, total, payment_status, shipping_status, order_status, awb_number, created_at'
          )
          .or(orderFilter)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('orders')
          .select('id, total, payment_status, shipping_status, created_at, order_items(quantity)')
          .or(orderFilter)
          .gte('created_at', activityRange.start.toISOString())
          .lte('created_at', activityRange.end.toISOString()),
        supabase
          .from('orders')
          .select('id, total, created_at')
          .or(orderFilter)
          .gte('created_at', windowRange.start.toISOString())
          .lte('created_at', windowRange.end.toISOString()),
        supabase
          .from('orders')
          .select('id, total, payment_status, shipping_status, awb_number, created_at')
          .or(orderFilter),
        supabase
          .from('checkout_sessions' as never)
          .select('id, total, expires_at, created_at, status')
          .eq('status', 'pending'),
        supabase
          .from('abandoned_carts' as never)
          .select('id, estimated_total, last_activity_at, status')
          .eq('status', 'active'),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (productsRes.error) throw productsRes.error;
      if (recentOrdersRes.error) throw recentOrdersRes.error;
      if (activityOrdersRes.error) throw activityOrdersRes.error;
      if (chartOrdersRes.error) throw chartOrdersRes.error;
      if (attentionOrdersRes.error) throw attentionOrdersRes.error;

      const profile = profileRes.data;
      const products = (productsRes.data || []) as ProductRow[];
      const recentOrders = (recentOrdersRes.data || []) as OrderRow[];
      const activityOrders = (activityOrdersRes.data || []) as OrderRow[];
      const chartOrders = (chartOrdersRes.data || []) as Array<{
        id: string;
        total: number;
        created_at: string;
      }>;
      const attentionOrders = (attentionOrdersRes.data || []) as OrderRow[];
      const pendingSessions = ((pendingSessionsRes.data || []) as SessionRow[]).filter(
        (row) => new Date(row.expires_at).getTime() > Date.now()
      );
      const abandoned = ((abandonedRes.data || []) as AbandonedRow[])
        .slice()
        .sort(
          (a, b) =>
            new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
        );

      const salesInPeriod = activityOrders.reduce((sum, order) => sum + Number(order.total), 0);
      const ordersInPeriod = activityOrders.length;
      const itemsInPeriod = activityOrders.reduce((sum, order) => {
        const qty = (order.order_items || []).reduce(
          (sub, item) => sub + Number(item.quantity || 0),
          0
        );
        return sum + qty;
      }, 0);

      const awaitingFulfillment = attentionOrders.filter(
        (order) =>
          order.shipping_status === 'pending' ||
          order.shipping_status === 'processing' ||
          !order.shipping_status
      );
      const failedOrders = attentionOrders.filter((order) => order.payment_status === 'failed');
      const ordersNeedingAwb = awaitingFulfillment.filter((order) => !order.awb_number);
      const cashOrders = attentionOrders.filter((order) => order.payment_status === 'cash').length;
      const cardPaidOrders = attentionOrders.filter(
        (order) => order.payment_status === 'paid' || order.payment_status === 'invoiced'
      ).length;

      const outOfStock = products.filter((product) => product.stock <= 0);
      const lowStock = products.filter(
        (product) =>
          product.stock > 0 && product.stock <= Math.max(1, product.low_stock_threshold || 5)
      );

      const attentionRows = [
        awaitingFulfillment.length > 0
          ? {
              id: 'fulfillment',
              tone: 'warning' as const,
              label: t('actionCenter.awaitingFulfillment', { count: awaitingFulfillment.length }),
              action: t('actionCenter.viewOrders'),
              tab: 'orders',
              icon: Truck,
            }
          : null,
        pendingSessions.length > 0
          ? {
              id: 'pending-payments',
              tone: 'pending' as const,
              label: t('actionCenter.pendingPayments', { count: pendingSessions.length }),
              action: t('actionCenter.reviewPayments'),
              tab: 'payments',
              icon: CreditCard,
            }
          : null,
        lowStock.length > 0
          ? {
              id: 'low-stock',
              tone: 'warning' as const,
              label: t('actionCenter.lowStock', { count: lowStock.length }),
              action: t('actionCenter.checkInventory'),
              tab: 'stock',
              icon: Package,
            }
          : null,
        ordersNeedingAwb.length > 0
          ? {
              id: 'need-awb',
              tone: 'info' as const,
              label: t('actionCenter.needAwb', { count: ordersNeedingAwb.length }),
              action: t('actionCenter.openShipping'),
              tab: 'orders',
              icon: Truck,
            }
          : null,
        failedOrders.length > 0
          ? {
              id: 'failed-payments',
              tone: 'critical' as const,
              label: t('actionCenter.failedPayments', { count: failedOrders.length }),
              action: t('actionCenter.reviewPayments'),
              tab: 'payments',
              icon: AlertTriangle,
            }
          : null,
      ].filter(Boolean) as Array<{
        id: string;
        tone: 'warning' | 'pending' | 'info' | 'critical';
        label: string;
        action: string;
        tab: string;
        icon: typeof Truck;
      }>;

      const chartBuckets = new Map<string, { sales: number; orders: number }>();
      chartOrders.forEach((order) => {
        const key = format(new Date(order.created_at), 'yyyy-MM-dd');
        const entry = chartBuckets.get(key) || { sales: 0, orders: 0 };
        entry.sales += Number(order.total);
        entry.orders += 1;
        chartBuckets.set(key, entry);
      });

      const chartData: Array<{ date: string; sales: number; orders: number }> = [];
      const cursor = new Date(windowRange.start);
      while (cursor <= windowRange.end) {
        const key = format(cursor, 'yyyy-MM-dd');
        const entry = chartBuckets.get(key) || { sales: 0, orders: 0 };
        chartData.push({ date: key, sales: entry.sales, orders: entry.orders });
        cursor.setDate(cursor.getDate() + 1);
      }

      const paymentsConnected = Boolean(
        profile?.netpopia_api_key?.trim() && profile?.netpopia_signature?.trim()
      );
      const shippingConnected = Boolean(profile?.eawb_api_key?.trim());
      const hasProducts = (productsRes.count || 0) > 0;

      return {
        profile,
        products,
        recentOrders,
        salesInPeriod,
        ordersInPeriod,
        itemsInPeriod,
        attentionRows,
        chartData,
        outOfStock,
        lowStock,
        pendingSessions,
        pendingPaymentsTotal: pendingSessions.reduce((sum, row) => sum + Number(row.total), 0),
        failedPaymentsCount: failedOrders.length,
        cashOrders,
        cardPaidOrders,
        abandoned,
        abandonedRevenue: abandoned.reduce(
          (sum, row) => sum + Number(row.estimated_total || 0),
          0
        ),
        hasProducts,
        hasOrders: recentOrders.length > 0,
        paymentsConnected,
        shippingConnected,
      };
    },
  });

  const pendingActionCount = data?.attentionRows.length || 0;
  const showLaunchState = !isLoading && data && !data.hasProducts && !data.hasOrders;
  const showContinueSetup =
    !onboarding.isLoading &&
    onboarding.profile != null &&
    onboarding.profile.setup_completed !== true;
  const nextSetupStep = onboarding.nextRecommended;

  return (
    <div className="sv-dashboard-home px-4 pb-24 pt-4 md:px-6 md:pb-8 md:pt-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="sv-dashboard-surface sv-dashboard-surface--hero">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="sv-dashboard-eyebrow">{t('header.eyebrow')}</p>
              <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                {t(greetingKeyForHour(), { name: storeName || t('defaultStoreName') })}
              </h1>
              <p className="sv-dashboard-muted max-w-2xl text-sm md:text-base">
                {t('header.subtitle')}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  pendingActionCount > 0 ? 'bg-[#6E3DFF]' : 'bg-emerald-400'
                )}
              />
              {pendingActionCount > 0
                ? t('header.pendingActions', { count: pendingActionCount })
                : t('header.caughtUp')}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
                {t('activity.eyebrow')}
              </p>
              <h2 className="mt-1 text-base font-semibold text-white">{t('activity.title')}</h2>
            </div>
            <ActivityPeriodSelector
              preset={activityPreset}
              label={activityPeriodLabel}
              customRange={customRange}
              onPresetChange={setActivityPreset}
              onCustomRangeChange={(next) => {
                setCustomRange(next);
                setActivityPreset('custom');
              }}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TodayMetric
              label={t('activity.sales', { period: activityPeriodLabel })}
              value={isLoading ? '—' : `${(data?.salesInPeriod || 0).toFixed(2)} RON`}
            />
            <TodayMetric
              label={t('activity.orders', { period: activityPeriodLabel })}
              value={isLoading ? '—' : String(data?.ordersInPeriod || 0)}
            />
            <TodayMetric
              label={t('activity.items', { period: activityPeriodLabel })}
              value={isLoading ? '—' : String(data?.itemsInPeriod || 0)}
            />
            <TodayMetric
              label={t('activity.attention')}
              value={isLoading ? '—' : String(pendingActionCount)}
            />
          </div>
        </section>

        <section className="sv-dashboard-surface sv-dashboard-surface--attention">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="sv-dashboard-eyebrow sv-dashboard-eyebrow--light">
                {t('actionCenter.eyebrow')}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white md:text-xl">
                {t('actionCenter.title')}
              </h2>
            </div>
            {data && data.attentionRows.length === 0 && (
              <div className="hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200 md:inline-flex">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t('actionCenter.allGood')}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-2xl border border-white/10 bg-white/5"
                />
              ))}
            </div>
          ) : data && data.attentionRows.length > 0 ? (
            <div className="space-y-2.5">
              {data.attentionRows.map((item) => (
                <ActionRow
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  action={item.action}
                  tone={item.tone}
                  onClick={() => onTabChange(item.tab)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-10 text-center text-white/80">
              <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-300" />
              <p className="text-sm font-medium">{t('actionCenter.caughtUp')}</p>
            </div>
          )}
        </section>

        {showLaunchState && (
          <section className="sv-dashboard-surface">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="sv-dashboard-eyebrow">{t('launchState.eyebrow')}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">{t('launchState.title')}</h2>
                <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--svd-muted))]">
                  {t('launchState.subtitle')}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                className="rounded-full bg-[#6E3DFF] hover:bg-[#4B21B6]"
                onClick={() => onTabChange('products')}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('launchState.addFirstProduct')}
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => onTabChange('settings')}
              >
                {t('launchState.connectPayments')}
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => onTabChange('settings')}
              >
                {t('launchState.connectShipping')}
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => onTabChange('templates')}
              >
                {t('launchState.customizeStorefront')}
              </Button>
            </div>
          </section>
        )}

        <section className="sv-dashboard-surface">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="sv-dashboard-eyebrow">{t('recentOrders.eyebrow')}</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{t('recentOrders.title')}</h2>
            </div>
            <button type="button" onClick={() => onTabChange('orders')} className="sv-dashboard-link">
              {t('recentOrders.viewAll')} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-2xl bg-[hsl(var(--svd-mist))]" />
              ))}
            </div>
          ) : data && data.recentOrders.length > 0 ? (
            <div className="space-y-2">
              {data.recentOrders.slice(0, 8).map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => openOrderFromDashboard(order.id, onTabChange)}
                  className="sv-dashboard-order-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-xs text-[hsl(var(--svd-muted))]">
                        #{order.id.slice(-8)}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {order.customer_name || order.customer_email}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[hsl(var(--svd-muted))]">
                      {formatAgo(order.created_at, t)}
                    </div>
                  </div>

                  <div className="hidden items-center gap-2 md:flex">
                    <StatusPill type="payment" status={order.payment_status} t={t} />
                    <StatusPill type="shipping" status={order.shipping_status} t={t} />
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-semibold">{Number(order.total).toFixed(2)} RON</div>
                    <div className="mt-1 flex justify-end md:hidden">
                      <StatusPill type="payment" status={order.payment_status} t={t} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyPanel
              icon={ShoppingCart}
              title={t('recentOrders.emptyTitle')}
              body={t('recentOrders.emptyBody')}
            />
          )}
        </section>

        <section className="sv-dashboard-surface">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="sv-dashboard-eyebrow">{t('performance.eyebrow')}</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{t('performance.title')}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                value={range}
                onChange={(value) => setRange(value as PerformanceRange)}
                options={[
                  { value: 'today', label: t('performance.range.today') },
                  { value: '7d', label: t('performance.range.7d') },
                  { value: '30d', label: t('performance.range.30d') },
                  { value: '90d', label: t('performance.range.90d') },
                ]}
              />
              <SegmentedControl
                value={metric}
                onChange={(value) => setMetric(value as PerformanceMetric)}
                options={[
                  { value: 'sales', label: t('performance.metric.sales') },
                  { value: 'orders', label: t('performance.metric.orders') },
                ]}
              />
            </div>
          </div>

          <Suspense
            fallback={
              <div className="h-[240px] animate-pulse rounded-2xl bg-[hsl(var(--svd-mist))]" />
            }
          >
            <DashboardRevenueChart
              data={data?.chartData || []}
              metric={metric}
              emptyLabel={t('performance.empty')}
            />
          </Suspense>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Inventory */}
          <div className="sv-dashboard-surface sv-dashboard-insight-card flex h-full flex-col">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="sv-dashboard-eyebrow">{t('inventory.eyebrow')}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">{t('inventory.title')}</h2>
              </div>
              <button type="button" onClick={() => onTabChange('stock')} className="sv-dashboard-link">
                {t('inventory.viewAll')} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1">
              {isLoading ? (
                <div className="space-y-3">
                  <div className="h-20 animate-pulse rounded-2xl bg-[hsl(var(--svd-mist))]" />
                  <div className="h-20 animate-pulse rounded-2xl bg-[hsl(var(--svd-mist))]" />
                </div>
              ) : data && (data.outOfStock.length > 0 || data.lowStock.length > 0) ? (
                <div className="space-y-4">
                  <InventoryGroup
                    title={t('inventory.outOfStock')}
                    tone="critical"
                    items={data.outOfStock.slice(0, 4)}
                    emptyLabel={t('inventory.noneOut')}
                  />
                  <InventoryGroup
                    title={t('inventory.lowStock')}
                    tone="warning"
                    items={data.lowStock.slice(0, 4)}
                    emptyLabel={t('inventory.noneLow')}
                  />
                </div>
              ) : (
                <EmptyPanel
                  icon={Package}
                  title={t('inventory.healthyTitle')}
                  body={t('inventory.healthyBody')}
                />
              )}
            </div>
          </div>

          {/* Abandoned Carts */}
          <div className="sv-dashboard-surface sv-dashboard-insight-card flex h-full flex-col">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="sv-dashboard-eyebrow">{t('abandoned.eyebrow')}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">{t('abandoned.title')}</h2>
              </div>
              <button type="button" onClick={() => onTabChange('orders')} className="sv-dashboard-link">
                {t('abandoned.view')} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1">
              {isLoading ? (
                <div className="h-28 animate-pulse rounded-2xl bg-[hsl(var(--svd-mist))]" />
              ) : data && data.abandoned.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-3xl font-semibold tracking-tight">
                    {t('abandoned.activeCount', { count: data.abandoned.length })}
                  </div>
                  <p className="text-sm text-[hsl(var(--svd-muted))]">
                    {t('abandoned.potentialValue', {
                      amount: `${data.abandonedRevenue.toFixed(2)} RON`,
                    })}
                  </p>
                  <p className="text-xs text-[hsl(var(--svd-muted))]">
                    {t('abandoned.lastActivity', {
                      time: formatAgo(data.abandoned[0].last_activity_at, t),
                    })}
                  </p>
                </div>
              ) : (
                <EmptyPanel
                  icon={ShoppingCart}
                  title={t('abandoned.emptyTitle')}
                  body={t('abandoned.emptyBody')}
                />
              )}
            </div>
          </div>

          {/* Payment Health */}
          <div className="sv-dashboard-surface sv-dashboard-insight-card flex h-full flex-col md:col-span-2 xl:col-span-1">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="sv-dashboard-eyebrow">{t('paymentHealth.eyebrow')}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">
                  {t('paymentHealth.title')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onTabChange('payments')}
                className="sv-dashboard-link"
              >
                {t('paymentHealth.view')} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1">
              {isLoading ? (
                <div className="h-28 animate-pulse rounded-2xl bg-[hsl(var(--svd-mist))]" />
              ) : data &&
                ((data.pendingSessions.length || 0) > 0 || (data.failedPaymentsCount || 0) > 0) ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-[hsl(var(--svd-line))] bg-[hsl(var(--svd-mist))]/70 px-3 py-3">
                      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[hsl(var(--svd-muted))]">
                        {t('paymentHealth.pending')}
                      </div>
                      <div className="mt-2 text-2xl font-semibold">{data.pendingSessions.length}</div>
                    </div>
                    <div className="rounded-2xl border border-[hsl(var(--svd-line))] bg-[hsl(var(--svd-mist))]/70 px-3 py-3">
                      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[hsl(var(--svd-muted))]">
                        {t('paymentHealth.failed')}
                      </div>
                      <div className="mt-2 text-2xl font-semibold">{data.failedPaymentsCount}</div>
                    </div>
                  </div>
                  {(data.cardPaidOrders > 0 || data.cashOrders > 0) && (
                    <p className="text-xs text-[hsl(var(--svd-muted))]">
                      {t('paymentHealth.mix', {
                        card: data.cardPaidOrders,
                        cash: data.cashOrders,
                      })}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[hsl(var(--svd-line))] bg-[hsl(var(--svd-mist))]/35 px-5 py-10 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
                  <p className="text-sm font-medium">{t('paymentHealth.allGood')}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {showContinueSetup && (
          <section className="sv-dashboard-surface overflow-hidden">
            <div className="relative">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(110,61,255,0.12),transparent_55%)]" />
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                  <p className="sv-dashboard-eyebrow">{t('setup.eyebrow')}</p>
                  <h2 className="text-xl font-semibold tracking-tight">{t('setup.title')}</h2>
                  <p className="text-sm text-[hsl(var(--svd-muted))]">
                    {t('setup.progress', {
                      done: onboarding.progress.done,
                      total: onboarding.progress.total,
                    })}
                  </p>
                  {nextSetupStep && (
                    <p className="text-sm font-medium">
                      {t('setup.next', {
                        step: tOnboarding(`review.steps.${nextSetupStep}`),
                      })}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  className="bg-[#6E3DFF] hover:bg-[#4B21B6]"
                  onClick={() => navigate('/setup')}
                >
                  {t('setup.open')} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--svd-mist))]">
                <div
                  className="h-full rounded-full bg-[#6E3DFF] transition-all duration-500"
                  style={{
                    width: `${Math.round(
                      (onboarding.progress.done / Math.max(onboarding.progress.total, 1)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </section>
        )}

        <div className="h-14 md:h-0" />
      </div>
    </div>
  );
}

function ActivityPeriodSelector({
  preset,
  label,
  customRange,
  onPresetChange,
  onCustomRangeChange,
}: {
  preset: ActivityPreset;
  label: string;
  customRange: { from: Date; to: Date };
  onPresetChange: (preset: ActivityPreset) => void;
  onCustomRangeChange: (range: { from: Date; to: Date }) => void;
}) {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const { i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage || i18n.language || 'ro').split('-')[0];
  const dateLocale = isAppLanguage(lng) && lng === 'en' ? enUS : ro;

  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState<Date | undefined>(customRange.from);
  const [tempTo, setTempTo] = useState<Date | undefined>(customRange.to);
  const [selectingDate, setSelectingDate] = useState<'from' | 'to'>('from');

  const presets: ActivityPreset[] = ['today', '3d', '7d', '14d', '30d', '90d', 'year'];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          >
            <CalendarIcon className="h-3.5 w-3.5 opacity-80" />
            <span className="max-w-[160px] truncate">{label}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 z-50">
          {presets.map((key) => (
            <DropdownMenuItem
              key={key}
              onClick={() => onPresetChange(key)}
              className={cn(preset === key && 'bg-accent')}
            >
              {t(`activity.period.${key}`)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setTempFrom(customRange.from);
              setTempTo(customRange.to);
              setSelectingDate('from');
              setIsCustomOpen(true);
            }}
          >
            {t('activity.period.custom')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <DialogContent className="sm:max-w-fit">
          <DialogHeader>
            <DialogTitle>{tCommon('dateRange.selectTitle')}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4 sm:flex-row">
            <div className="space-y-2">
              <Button
                variant={selectingDate === 'from' ? 'default' : 'outline'}
                size="sm"
                className="w-full justify-start"
                onClick={() => setSelectingDate('from')}
              >
                {tCommon('dateRange.from', {
                  date: tempFrom
                    ? format(tempFrom, 'PPP', { locale: dateLocale })
                    : tCommon('dateRange.selectDate'),
                })}
              </Button>
              {selectingDate === 'from' && (
                <Calendar
                  mode="single"
                  selected={tempFrom}
                  onSelect={(date) => {
                    setTempFrom(date);
                    if (date) setSelectingDate('to');
                  }}
                  disabled={(date) => date > new Date()}
                  className="rounded-md border pointer-events-auto"
                />
              )}
            </div>

            <div className="space-y-2">
              <Button
                variant={selectingDate === 'to' ? 'default' : 'outline'}
                size="sm"
                className="w-full justify-start"
                onClick={() => setSelectingDate('to')}
              >
                {tCommon('dateRange.to', {
                  date: tempTo
                    ? format(tempTo, 'PPP', { locale: dateLocale })
                    : tCommon('dateRange.selectDate'),
                })}
              </Button>
              {selectingDate === 'to' && (
                <Calendar
                  mode="single"
                  selected={tempTo}
                  onSelect={setTempTo}
                  disabled={(date) => date > new Date() || (tempFrom ? date < tempFrom : false)}
                  className="rounded-md border pointer-events-auto"
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCustomOpen(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              disabled={!tempFrom || !tempTo}
              onClick={() => {
                if (!tempFrom || !tempTo) return;
                onCustomRangeChange({ from: tempFrom, to: tempTo });
                setIsCustomOpen(false);
              }}
            >
              {tCommon('dateRange.apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TodayMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/55">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  action,
  tone,
  onClick,
}: {
  icon: typeof Truck;
  label: string;
  action: string;
  tone: 'warning' | 'pending' | 'info' | 'critical';
  onClick: () => void;
}) {
  const toneClass = {
    warning: 'border-white/10 bg-white/6',
    pending: 'border-white/10 bg-white/6',
    info: 'border-white/10 bg-white/6',
    critical: 'border-[#6E3DFF]/25 bg-[#6E3DFF]/10',
  }[tone];

  return (
    <button type="button" onClick={onClick} className={cn('sv-dashboard-action-row', toneClass)}>
      <div className="flex items-center gap-3">
        <div className="rounded-full border border-white/10 bg-white/8 p-2">
          <Icon className="h-4 w-4 text-white/85" />
        </div>
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <span className="inline-flex items-center gap-1 text-sm text-white/70">
        {action} <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="inline-flex rounded-full border border-[hsl(var(--svd-line))] bg-[hsl(var(--svd-mist))] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium transition-all',
            value === option.value
              ? 'bg-[#6E3DFF] text-white shadow-sm'
              : 'text-[hsl(var(--svd-muted))] hover:text-[hsl(var(--svd-ink))]'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StatusPill({
  status,
  type,
  t,
}: {
  status: string;
  type: 'payment' | 'shipping';
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const paymentMap: Record<string, string> = {
    paid: t('status.paid'),
    completed: t('status.paid'),
    pending: t('status.pending'),
    failed: t('status.failed'),
    refunded: t('status.refunded'),
    cash: t('status.cash'),
    invoiced: t('status.paid'),
  };
  const shippingMap: Record<string, string> = {
    pending: t('status.awaitingShipment'),
    processing: t('status.processing'),
    shipped: t('status.shipped'),
    delivered: t('status.delivered'),
    cancelled: t('status.cancelled'),
  };
  const label = type === 'payment' ? paymentMap[status] || status : shippingMap[status] || status;
  const tone =
    status === 'paid' || status === 'completed' || status === 'delivered' || status === 'invoiced'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : status === 'failed' || status === 'cancelled'
        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
        : status === 'cash'
          ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300';

  return <span className={cn('rounded-full px-2 py-1 text-[11px] font-medium', tone)}>{label}</span>;
}

function InventoryGroup({
  title,
  items,
  tone,
  emptyLabel,
}: {
  title: string;
  items: ProductRow[];
  tone: 'critical' | 'warning';
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <span
          className={cn(
            'rounded-full px-2 py-1 text-[11px] font-medium',
            tone === 'critical'
              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
          )}
        >
          {items.length}
        </span>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--svd-line))] bg-[hsl(var(--svd-mist))]/70 px-3 py-2.5"
            >
              <div className="h-10 w-10 overflow-hidden rounded-xl bg-[hsl(var(--svd-paper))]">
                {item.image ? (
                  <img src={item.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-4 w-4 text-[hsl(var(--svd-muted))]" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{item.title}</div>
                <div className="text-xs text-[hsl(var(--svd-muted))]">{item.sku || '—'}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{item.stock}</div>
                <div className="text-[11px] text-[hsl(var(--svd-muted))]">left</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[hsl(var(--svd-muted))]">{emptyLabel}</p>
      )}
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShoppingCart;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[hsl(var(--svd-line))] bg-[hsl(var(--svd-mist))]/35 px-5 py-10 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-[hsl(var(--svd-muted))]" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-[hsl(var(--svd-muted))]">{body}</p>
    </div>
  );
}
