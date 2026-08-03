import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Eye, RefreshCw, Clock, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDateTime } from '@/i18n/format';
import type { TFunction } from 'i18next';

export interface CheckoutSessionItem {
  product_id?: string | null;
  title?: string;
  product_title?: string;
  price?: number;
  product_price?: number;
  quantity?: number;
}

export interface CheckoutSessionRow {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_address: string;
  items: CheckoutSessionItem[] | null;
  total: number;
  payment_method: string;
  payment_status: string;
  status: string;
  created_at: string;
  expires_at: string;
  delivery_type: string | null;
  locker_name: string | null;
}

function formatRemaining(
  expiresAt: string,
  nowMs: number,
  t: TFunction<'orders'>
): { label: string; expired: boolean } {
  const remainingMs = new Date(expiresAt).getTime() - nowMs;
  if (remainingMs <= 0) {
    return { label: t('pending.remaining.expired'), expired: true };
  }
  const totalMinutes = Math.ceil(remainingMs / 60000);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return {
      label:
        mins > 0
          ? t('pending.remaining.hoursMins', { hours, mins })
          : t('pending.remaining.hours', { hours }),
      expired: false,
    };
  }
  return { label: t('pending.remaining.minutes', { mins: totalMinutes }), expired: false };
}

function itemTitle(item: CheckoutSessionItem, fallback: string) {
  return item.title || item.product_title || fallback;
}

function itemPrice(item: CheckoutSessionItem) {
  return Number(item.price ?? item.product_price ?? 0);
}

function itemQty(item: CheckoutSessionItem) {
  return Number(item.quantity ?? 1);
}

export function PendingCheckoutsSection() {
  const { t } = useTranslation('orders');
  const { t: tCommon } = useTranslation('common');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [selected, setSelected] = useState<CheckoutSessionRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const dash = tCommon('dash');
  const ron = tCommon('ron');
  const itemFallback = t('pending.item');

  const formatMoney = (amount: number) => `${Number(amount).toFixed(2)} ${ron}`;

  const paymentLabel = (method: string | null | undefined) => {
    if (method === 'card' || !method) return t('pending.payment.card');
    return method;
  };

  const { data: sessions = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['checkout-sessions-pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checkout_sessions' as any)
        .select('*')
        .in('status', ['pending', 'expired'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as CheckoutSessionRow[];
    },
    refetchInterval: 45_000,
  });

  const pendingCount = useMemo(
    () => sessions.filter((s) => s.status === 'pending' && new Date(s.expires_at).getTime() > nowMs).length,
    [sessions, nowMs]
  );

  useEffect(() => {
    if (pendingCount > 0) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [pendingCount]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('pending-checkouts-ui')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkout_sessions' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['checkout-sessions-pending'] });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['checkout-sessions-pending'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success(t('pending.toast.refreshed'));
    } catch {
      toast.error(t('pending.toast.refreshFailed'));
    }
  };

  const handleView = (session: CheckoutSessionRow) => {
    setSelected(session);
    setDetailsOpen(true);
  };

  const items = Array.isArray(selected?.items) ? selected!.items : [];

  return (
    <>
      <Card className="border-dashed">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CardHeader className="py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex items-center gap-2 text-left hover:opacity-90">
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {pendingCount > 0
                        ? t('pending.titleCount', { count: pendingCount })
                        : t('pending.title')}
                    </CardTitle>
                    <CardDescription>{t('pending.description')}</CardDescription>
                  </div>
                </button>
              </CollapsibleTrigger>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                {t('pending.refresh')}
              </Button>
            </div>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="pt-0">
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-4">{t('pending.loading')}</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">{t('pending.empty')}</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('pending.table.customer')}</TableHead>
                        <TableHead className="hidden md:table-cell">{t('pending.table.contact')}</TableHead>
                        <TableHead className="hidden lg:table-cell">{t('pending.table.products')}</TableHead>
                        <TableHead>{t('pending.table.total')}</TableHead>
                        <TableHead className="hidden sm:table-cell">{t('pending.table.payment')}</TableHead>
                        <TableHead>{t('pending.table.status')}</TableHead>
                        <TableHead className="hidden sm:table-cell">{t('pending.table.expires')}</TableHead>
                        <TableHead className="w-[70px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessions.map((session) => {
                        const countdown = formatRemaining(session.expires_at, nowMs, t);
                        const isExpired = session.status === 'expired' || countdown.expired;
                        const sessionItems = Array.isArray(session.items) ? session.items : [];
                        const productSummary = sessionItems
                          .map((i) => `${itemTitle(i, itemFallback)} ×${itemQty(i)}`)
                          .join(', ');

                        return (
                          <TableRow
                            key={session.id}
                            className={`cursor-pointer ${isExpired ? 'opacity-70' : ''}`}
                            onClick={() => handleView(session)}
                          >
                            <TableCell>
                              <div className="font-medium">{session.customer_name}</div>
                              <div className="text-xs text-muted-foreground md:hidden">
                                {session.customer_email}
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm">
                              <div>{session.customer_email}</div>
                              <div className="text-muted-foreground">{session.customer_phone || dash}</div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-sm max-w-[240px] truncate" title={productSummary}>
                              {productSummary || dash}
                            </TableCell>
                            <TableCell className="font-medium whitespace-nowrap">
                              {formatMoney(Number(session.total))}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm">
                              <Badge variant="outline" className="capitalize">
                                {paymentLabel(session.payment_method)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={isExpired ? 'outline' : 'secondary'}>
                                {isExpired ? t('pending.status.expired') : t('pending.status.pending')}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                {countdown.label}
                              </span>
                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(session.created_at)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleView(session)}
                                aria-label={t('pending.viewAria')}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('pending.detailsTitle')}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-muted-foreground">
                    {t('pending.sessionId', { id: selected.id.slice(-8) })}
                  </p>
                  <p className="text-lg font-semibold">{formatMoney(Number(selected.total))}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const countdown = formatRemaining(selected.expires_at, nowMs, t);
                    const isExpired = selected.status === 'expired' || countdown.expired;
                    return (
                      <>
                        <Badge variant={isExpired ? 'outline' : 'secondary'}>
                          {isExpired ? t('pending.status.expired') : t('pending.status.pending')}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {paymentLabel(selected.payment_method)}
                        </Badge>
                        <Badge variant="outline">{countdown.label}</Badge>
                      </>
                    );
                  })()}
                </div>
              </div>

              <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
                {t('pending.notice')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('pending.customerInfo')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><strong>{t('pending.field.name')}:</strong> {selected.customer_name}</div>
                    <div><strong>{t('pending.field.email')}:</strong> {selected.customer_email}</div>
                    <div><strong>{t('pending.field.phone')}:</strong> {selected.customer_phone || dash}</div>
                    <div><strong>{t('pending.field.address')}:</strong> {selected.customer_address}</div>
                    {selected.delivery_type && (
                      <div><strong>{t('pending.field.delivery')}:</strong> {selected.delivery_type}</div>
                    )}
                    {selected.locker_name && (
                      <div><strong>{t('pending.field.locker')}:</strong> {selected.locker_name}</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('pending.sessionInfo')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><strong>{t('pending.field.created')}:</strong> {formatDateTime(selected.created_at)}</div>
                    <div><strong>{t('pending.field.expires')}:</strong> {formatDateTime(selected.expires_at)}</div>
                    <div><strong>{t('pending.field.paymentMethod')}:</strong> {paymentLabel(selected.payment_method)}</div>
                    <div><strong>{t('pending.field.sessionId')}:</strong> <span className="font-mono text-xs">{selected.id}</span></div>
                    <div><strong>{t('pending.field.total')}:</strong> {formatMoney(Number(selected.total))}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('pending.orderItems')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('table.product')}</TableHead>
                          <TableHead>{t('table.price')}</TableHead>
                          <TableHead>{t('table.quantity')}</TableHead>
                          <TableHead>{t('table.total')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, idx) => (
                          <TableRow key={`${itemTitle(item, itemFallback)}-${idx}`}>
                            <TableCell>{itemTitle(item, itemFallback)}</TableCell>
                            <TableCell>{formatMoney(itemPrice(item))}</TableCell>
                            <TableCell>{itemQty(item)}</TableCell>
                            <TableCell>{formatMoney(itemPrice(item) * itemQty(item))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="md:hidden space-y-3">
                    {items.map((item, idx) => (
                      <div key={`${itemTitle(item, itemFallback)}-${idx}`} className="border rounded-md p-3 text-sm">
                        <div className="font-medium">{itemTitle(item, itemFallback)}</div>
                        <div className="text-muted-foreground">
                          {itemQty(item)} × {formatMoney(itemPrice(item))} ={' '}
                          {formatMoney(itemPrice(item) * itemQty(item))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-4 pt-3 border-t">
                    <span className="text-lg font-semibold">
                      {formatMoney(Number(selected.total))}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
