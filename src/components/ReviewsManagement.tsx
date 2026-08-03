import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Check,
  ChevronDown,
  Download,
  Lightbulb,
  Loader2,
  MessageSquare,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { ReviewEditorDrawer } from '@/components/ReviewEditorDrawer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { chartTooltipStyle, useChartTheme } from '@/hooks/useChartTheme';
import {
  buildReviewAnalytics,
  normalizeReviewStatus,
  relativeTime,
  statusBadgeClass,
  type ReviewRow,
  type ReviewStatus,
} from '@/lib/reviewAnalytics';
import { cn } from '@/lib/utils';

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

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn('h-3.5 w-3.5', s <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')}
        />
      ))}
    </div>
  );
}

type SortKey = 'newest' | 'oldest' | 'highest' | 'lowest';

export default function ReviewsManagement() {
  const { t: tReviews } = useTranslation('reviews');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const chartTheme = useChartTheme();
  const tip = chartTooltipStyle(chartTheme);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewStatus>('all');
  const [ratingFilter, setRatingFilter] = useState<'all' | '1' | '2' | '3' | '4' | '5'>('all');
  const [productFilter, setProductFilter] = useState('all');
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [withEmailOnly, setWithEmailOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerReview, setDrawerReview] = useState<ReviewRow | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(() => {
    try {
      return localStorage.getItem('reviews-show-analytics') === '1';
    } catch {
      return false;
    }
  });

  const toggleAnalytics = (next: boolean) => {
    setShowAnalytics(next);
    try {
      localStorage.setItem('reviews-show-analytics', next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['reviews', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select(
          `
          *,
          product:products(id, title, image, sku, price)
        `
        )
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        status: normalizeReviewStatus(r),
      })) as ReviewRow[];
    },
    enabled: !!user,
  });

  const liveDrawerReview = useMemo(() => {
    if (!drawerReview) return null;
    return reviews.find((r) => r.id === drawerReview.id) || null;
  }, [drawerReview, reviews]);

  useEffect(() => {
    if (drawerReview && reviews.length > 0 && !reviews.some((r) => r.id === drawerReview.id)) {
      setDrawerReview(null);
    }
  }, [drawerReview, reviews]);

  const { data: customization } = useQuery({
    queryKey: ['template-customization-reviews', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_customization')
        .select('id, show_reviews, template_id')
        .eq('user_id', user!.id)
        .eq('template_id', 'elementar')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const analytics = useMemo(() => buildReviewAnalytics(reviews), [reviews]);

  const products = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reviews) {
      if (r.product_id) map.set(r.product_id, r.product?.title || tReviews('productFallback'));
    }
    return [...map.entries()].map(([id, title]) => ({ id, title }));
  }, [reviews, tReviews]);

  const filtered = useMemo(() => {
    let list = [...reviews];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.customer_name.toLowerCase().includes(q) ||
          (r.customer_email || '').toLowerCase().includes(q) ||
          (r.review_text || '').toLowerCase().includes(q) ||
          (r.product?.title || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') list = list.filter((r) => normalizeReviewStatus(r) === statusFilter);
    if (ratingFilter !== 'all') list = list.filter((r) => r.rating === Number(ratingFilter));
    if (productFilter !== 'all') list = list.filter((r) => r.product_id === productFilter);
    if (unansweredOnly) list = list.filter((r) => !(r.merchant_reply && r.merchant_reply.trim()));
    if (withEmailOnly) list = list.filter((r) => !!(r.customer_email && r.customer_email.trim()));
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      list = list.filter((r) => new Date(r.created_at).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((r) => new Date(r.created_at).getTime() <= to.getTime());
    }

    list.sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'highest':
          return b.rating - a.rating;
        case 'lowest':
          return a.rating - b.rating;
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return list;
  }, [reviews, search, statusFilter, ratingFilter, productFilter, unansweredOnly, withEmailOnly, dateFrom, dateTo, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const rows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const toggleReviewsMutation = useMutation({
    mutationFn: async (showReviews: boolean) => {
      if (customization?.id) {
        const { error } = await supabase
          .from('template_customization')
          .update({ show_reviews: showReviews })
          .eq('id', customization.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('template_customization').insert({
          user_id: user?.id,
          template_id: 'elementar',
          show_reviews: showReviews,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-customization-reviews'] });
      toast.success(tReviews('toast.visibilityUpdated'));
    },
    onError: () => toast.error(tReviews('toast.visibilityFailed')),
  });

  const bulkStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: ReviewStatus }) => {
      const { error } = await supabase
        .from('reviews')
        .update({ status, is_approved: status === 'approved' })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      setSelected(new Set());
      toast.success(tReviews('toast.updated'));
    },
    onError: () => toast.error(tReviews('toast.bulkFailed')),
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('reviews').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      setSelected(new Set());
      toast.success(tReviews('toast.deleted'));
    },
    onError: () => toast.error(tReviews('toast.deleteFailed')),
  });

  const exportCsv = () => {
    const header = [
      tReviews('csvHeaders.customer'),
      tReviews('csvHeaders.email'),
      tReviews('csvHeaders.product'),
      tReviews('csvHeaders.rating'),
      tReviews('csvHeaders.review'),
      tReviews('csvHeaders.status'),
      tReviews('csvHeaders.created'),
      tReviews('csvHeaders.reply'),
    ];
    const lines = filtered.map((r) =>
      [
        r.customer_name,
        r.customer_email || '',
        r.product?.title || '',
        r.rating,
        (r.review_text || '').replace(/"/g, '""'),
        normalizeReviewStatus(r),
        r.created_at,
        (r.merchant_reply || '').replace(/"/g, '""'),
      ]
        .map((c) => `"${c}"`)
        .join(',')
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reviews-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedIds = [...selected];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            {tReviews('title')}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {tReviews('descriptionLong')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center space-x-2">
            <Switch
              id="show-reviews"
              checked={customization?.show_reviews ?? true}
              onCheckedChange={(checked) => toggleReviewsMutation.mutate(checked)}
            />
            <Label htmlFor="show-reviews" className="text-sm">
              {tReviews('showOnStorefront')}
            </Label>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" />
            {tReviews('exportCsv')}
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{tReviews('overview')}</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => toggleAnalytics(!showAnalytics)}>
            <BarChart3 className="h-4 w-4 mr-2" />
            {showAnalytics ? tCommon('hideAnalytics') : tCommon('showAnalytics')}
            <ChevronDown className={cn('h-4 w-4 ml-1 transition-transform', showAnalytics && 'rotate-180')} />
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard title={tReviews('kpi.total')} value={String(analytics.kpis.total)} subtitle={tReviews('kpi.totalSub')} icon={MessageSquare} />
          <KpiCard title={tReviews('kpi.pending')} value={String(analytics.kpis.pending)} subtitle={tReviews('kpi.pendingSub')} icon={Loader2} />
          <KpiCard title={tReviews('kpi.published')} value={String(analytics.kpis.published)} subtitle={tReviews('kpi.publishedSub')} icon={Check} />
          <KpiCard title={tReviews('kpi.avgRating')} value={String(analytics.kpis.avgRating)} subtitle={tReviews('kpi.avgRatingSub')} icon={Star} />
          <KpiCard title={tReviews('kpi.fiveStarShare')} value={`${analytics.kpis.fiveStarPct}%`} subtitle={tReviews('kpi.fiveStarShareSub')} icon={Star} />
          <KpiCard title={tReviews('kpi.thisMonth')} value={String(analytics.kpis.thisMonth)} subtitle={tReviews('kpi.thisMonthSub')} icon={BarChart3} />
        </div>
      </section>

      <Collapsible open={showAnalytics} onOpenChange={toggleAnalytics}>
        <CollapsibleContent className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tReviews('analytics.ratingDistribution')}</CardTitle>
              </CardHeader>
              <CardContent className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.ratingDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis dataKey="rating" tick={{ fontSize: 11, fill: chartTheme.axis }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTheme.axis }} width={28} />
                    <Tooltip contentStyle={tip} />
                    <Bar dataKey="count" fill={chartTheme.c4} radius={[4, 4, 0, 0]} name={tReviews('analytics.chartReviews')} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tReviews('analytics.reviewsOverTime')}</CardTitle>
              </CardHeader>
              <CardContent className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.reviewsOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.axis }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTheme.axis }} width={28} />
                    <Tooltip contentStyle={tip} />
                    <Bar dataKey="count" fill={chartTheme.c3} radius={[4, 4, 0, 0]} name={tReviews('analytics.chartReviews')} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tReviews('analytics.mostReviewed')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {analytics.mostReviewed.length === 0 && (
                  <p className="text-muted-foreground">{tReviews('analytics.noDataYet')}</p>
                )}
                {analytics.mostReviewed.map((p) => (
                  <div key={p.productId} className="flex justify-between gap-2">
                    <span className="truncate">{p.title}</span>
                    <span className="text-muted-foreground shrink-0">{p.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tReviews('analytics.highestRated')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {analytics.highestRated.map((p) => (
                  <div key={p.productId} className="flex justify-between gap-2">
                    <span className="truncate">{p.title}</span>
                    <span className="tabular-nums shrink-0">{p.avg.toFixed(1)}★</span>
                  </div>
                ))}
                {!analytics.highestRated.length && (
                  <p className="text-muted-foreground">{tReviews('analytics.noDataYet')}</p>
                )}
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tReviews('analytics.lowestRated')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {analytics.lowestRated.map((p) => (
                  <div key={p.productId} className="flex justify-between gap-2">
                    <span className="truncate">{p.title}</span>
                    <span className="tabular-nums shrink-0">{p.avg.toFixed(1)}★</span>
                  </div>
                ))}
                {!analytics.lowestRated.length && (
                  <p className="text-muted-foreground">{tReviews('analytics.noDataYet')}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard title={tReviews('kpi.approvalRate')} value={`${analytics.kpis.approvalRate}%`} subtitle={tReviews('kpi.approvalRateSub')} icon={Check} />
            <KpiCard title={tReviews('kpi.responseRate')} value={`${analytics.kpis.responseRate}%`} subtitle={tReviews('kpi.responseRateSub')} icon={MessageSquare} />
            <KpiCard title={tReviews('kpi.rejected')} value={String(analytics.kpis.rejected)} subtitle={tReviews('kpi.rejectedSub')} icon={Trash2} />
            <KpiCard title={tReviews('kpi.spam')} value={String(analytics.kpis.spam)} subtitle={tReviews('kpi.spamSub')} icon={Trash2} />
          </div>

          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                {tReviews('insightsTitle')}
              </CardTitle>
              <CardDescription>{tReviews('analytics.insightsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-2">
              {analytics.insights.map((insight) => (
                <div key={insight} className="rounded-md border bg-muted/20 p-3 text-sm">
                  {insight}
                </div>
              ))}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder={tReviews('searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder={tReviews('filter.status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tReviews('filter.allStatuses')}</SelectItem>
            <SelectItem value="pending">{tReviews('status.pending')}</SelectItem>
            <SelectItem value="approved">{tReviews('status.approved')}</SelectItem>
            <SelectItem value="rejected">{tReviews('status.rejected')}</SelectItem>
            <SelectItem value="spam">{tReviews('status.spam')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ratingFilter} onValueChange={(v: any) => { setRatingFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder={tReviews('filter.rating')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tReviews('filter.allRatings')}</SelectItem>
            {[5, 4, 3, 2, 1].map((r) => (
              <SelectItem key={r} value={String(r)}>{r}★</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={productFilter} onValueChange={(v) => { setProductFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={tReviews('filter.product')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tReviews('filter.allProducts')}</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v: SortKey) => setSort(v)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{tReviews('sort.newest')}</SelectItem>
            <SelectItem value="oldest">{tReviews('sort.oldest')}</SelectItem>
            <SelectItem value="highest">{tReviews('sort.highest')}</SelectItem>
            <SelectItem value="lowest">{tReviews('sort.lowest')}</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={unansweredOnly} onCheckedChange={(c) => { setUnansweredOnly(c === true); setPage(1); }} />
          {tReviews('unansweredOnly')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={withEmailOnly} onCheckedChange={(c) => { setWithEmailOnly(c === true); setPage(1); }} />
          {tReviews('withEmailOnly')}
        </label>
        <Input
          type="date"
          className="w-[150px]"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          aria-label={tReviews('fromDate')}
        />
        <Input
          type="date"
          className="w-[150px]"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          aria-label={tReviews('toDate')}
        />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap gap-2 items-center rounded-lg border bg-muted/30 p-3">
          <span className="text-sm font-medium">{tCommon('selected', { count: selected.size })}</span>
          <Button size="sm" onClick={() => bulkStatus.mutate({ ids: selectedIds, status: 'approved' })}>{tReviews('approve')}</Button>
          <Button size="sm" variant="outline" onClick={() => bulkStatus.mutate({ ids: selectedIds, status: 'rejected' })}>{tReviews('reject')}</Button>
          <Button size="sm" variant="outline" onClick={() => bulkStatus.mutate({ ids: selectedIds, status: 'spam' })}>{tReviews('spam')}</Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (confirm(tReviews('deleteConfirm', { count: selected.size }))) bulkDelete.mutate(selectedIds);
            }}
          >
            {tCommon('delete')}
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center space-y-3">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground" />
            <h3 className="text-lg font-semibold">
              {reviews.length === 0 ? tReviews('empty') : tReviews('emptyFiltered')}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {reviews.length === 0
                ? tReviews('emptyHint')
                : tReviews('emptyFilteredHint')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                      onCheckedChange={(checked) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          rows.forEach((r) => (checked ? next.add(r.id) : next.delete(r.id)));
                          return next;
                        });
                      }}
                    />
                  </TableHead>
                  <TableHead>{tReviews('table.customer')}</TableHead>
                  <TableHead>{tReviews('table.product')}</TableHead>
                  <TableHead>{tReviews('table.rating')}</TableHead>
                  <TableHead className="min-w-[180px]">{tReviews('table.review')}</TableHead>
                  <TableHead>{tReviews('table.status')}</TableHead>
                  <TableHead>{tReviews('table.created')}</TableHead>
                  <TableHead>{tReviews('table.replied')}</TableHead>
                  <TableHead className="text-right">{tReviews('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const st = normalizeReviewStatus(r);
                  const initials = r.customer_name
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => setDrawerReview(r)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={(checked) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(r.id);
                              else next.delete(r.id);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.customer_name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {r.customer_email || '—'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 max-w-[180px]">
                          <div className="h-9 w-9 rounded-md overflow-hidden bg-muted shrink-0">
                            {r.product?.image && (
                              <img src={r.product.image} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                          <span className="truncate text-sm">{r.product?.title || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell><Stars rating={r.rating} /></TableCell>
                      <TableCell>
                        <p className="text-sm line-clamp-2 max-w-xs">{r.review_text || '—'}</p>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusBadgeClass(st)}>
                          {tReviews(`status.${st}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {relativeTime(r.created_at)}
                      </TableCell>
                      <TableCell>
                        {r.merchant_reply ? (
                          <Badge variant="secondary">{tCommon('yes')}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{tCommon('no')}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {st !== 'approved' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title={tReviews('approve')}
                              onClick={() => bulkStatus.mutate({ ids: [r.id], status: 'approved' })}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          {st !== 'rejected' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title={tReviews('reject')}
                              onClick={() => bulkStatus.mutate({ ids: [r.id], status: 'rejected' })}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setDrawerReview(r)}>
                            {tCommon('open')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {tReviews('pagination', { page: pageSafe, total: totalPages, count: filtered.length })}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)}>
                {tCommon('previous')}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => p + 1)}>
                {tCommon('next')}
              </Button>
            </div>
          </div>
        </>
      )}

      <ReviewEditorDrawer
        review={liveDrawerReview}
        open={!!drawerReview}
        onOpenChange={(o) => {
          if (!o) setDrawerReview(null);
        }}
        allReviews={reviews}
      />
    </div>
  );
}
