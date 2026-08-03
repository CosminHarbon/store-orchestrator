import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Eye, RefreshCw, ShoppingCart } from 'lucide-react';
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

export interface AbandonedCartItem {
  product_id?: string | null;
  title?: string;
  product_title?: string;
  price?: number;
  product_price?: number;
  quantity?: number;
}

export interface AbandonedCartRow {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  items: AbandonedCartItem[] | null;
  cart_subtotal: number;
  estimated_total: number;
  payment_method: string | null;
  status: string;
  checkout_step: string;
  last_activity_at: string;
  created_at: string;
  delivery_type: string | null;
  locker_name: string | null;
  customer_city: string | null;
  customer_county: string | null;
}

function itemTitle(item: AbandonedCartItem, fallback: string) {
  return item.title || item.product_title || fallback;
}

function itemPrice(item: AbandonedCartItem) {
  return Number(item.price ?? item.product_price ?? 0);
}

function itemQty(item: AbandonedCartItem) {
  return Number(item.quantity ?? 1);
}

function formatAbandonedAgo(lastActivityAt: string, nowMs: number, t: TFunction<'orders'>): string {
  const diffMs = Math.max(0, nowMs - new Date(lastActivityAt).getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t('abandoned.ago.justNow');
  if (minutes < 60) return t('abandoned.ago.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('abandoned.ago.hours', { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t('abandoned.ago.yesterday');
  return t('abandoned.ago.days', { count: days });
}

export function AbandonedCartsSection() {
  const { t } = useTranslation('orders');
  const { t: tCommon } = useTranslation('common');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [selected, setSelected] = useState<AbandonedCartRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const dash = tCommon('dash');
  const ron = tCommon('ron');
  const itemFallback = t('abandoned.item');

  const formatMoney = (amount: number) => `${Number(amount).toFixed(2)} ${ron}`;

  const { data: carts = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['abandoned-carts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('abandoned_carts' as any)
        .select('*')
        .in('status', ['active', 'expired'])
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as AbandonedCartRow[];
    },
    refetchInterval: 45_000,
  });

  const activeCount = useMemo(
    () => carts.filter((c) => c.status === 'active').length,
    [carts]
  );

  useEffect(() => {
    if (activeCount > 0) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [activeCount]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('abandoned-carts-ui')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'abandoned_carts' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['abandoned-carts'] });
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
      toast.success(t('abandoned.toast.refreshed'));
    } catch {
      toast.error(t('abandoned.toast.refreshFailed'));
    }
  };

  const handleView = (cart: AbandonedCartRow) => {
    setSelected(cart);
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
                      {activeCount > 0
                        ? t('abandoned.titleCount', { count: activeCount })
                        : t('abandoned.title')}
                    </CardTitle>
                    <CardDescription>{t('abandoned.description')}</CardDescription>
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
                {t('abandoned.refresh')}
              </Button>
            </div>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="pt-0">
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-4">{t('abandoned.loading')}</p>
              ) : carts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">{t('abandoned.empty')}</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('abandoned.table.customer')}</TableHead>
                        <TableHead className="hidden md:table-cell">{t('abandoned.table.contact')}</TableHead>
                        <TableHead className="hidden lg:table-cell">{t('abandoned.table.products')}</TableHead>
                        <TableHead>{t('abandoned.table.total')}</TableHead>
                        <TableHead>{t('abandoned.table.status')}</TableHead>
                        <TableHead className="hidden sm:table-cell">{t('abandoned.table.lastActivity')}</TableHead>
                        <TableHead className="w-[70px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {carts.map((cart) => {
                        const cartItems = Array.isArray(cart.items) ? cart.items : [];
                        const productSummary = cartItems
                          .map((i) => `${itemTitle(i, itemFallback)} ×${itemQty(i)}`)
                          .join(', ');
                        const isExpired = cart.status === 'expired';

                        return (
                          <TableRow
                            key={cart.id}
                            className={`cursor-pointer ${isExpired ? 'opacity-70' : ''}`}
                            onClick={() => handleView(cart)}
                          >
                            <TableCell>
                              <div className="font-medium">{cart.customer_name || dash}</div>
                              <div className="text-xs text-muted-foreground md:hidden">
                                {cart.customer_email || dash}
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm">
                              <div>{cart.customer_email || dash}</div>
                              <div className="text-muted-foreground">{cart.customer_phone || dash}</div>
                            </TableCell>
                            <TableCell
                              className="hidden lg:table-cell text-sm max-w-[240px] truncate"
                              title={productSummary}
                            >
                              {productSummary || dash}
                            </TableCell>
                            <TableCell className="font-medium whitespace-nowrap">
                              {formatMoney(Number(cart.estimated_total || cart.cart_subtotal || 0))}
                            </TableCell>
                            <TableCell>
                              <Badge variant={isExpired ? 'outline' : 'secondary'}>
                                {isExpired ? t('abandoned.status.expired') : t('abandoned.status.abandoned')}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm">
                              <div>{formatAbandonedAgo(cart.last_activity_at, nowMs, t)}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(cart.last_activity_at)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleView(cart);
                                }}
                                aria-label={t('abandoned.viewAria')}
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
              <ShoppingCart className="h-5 w-5" />
              {t('abandoned.detailsTitle')}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-muted-foreground">
                    {t('abandoned.cartId', { id: selected.id.slice(-8) })}
                  </p>
                  <p className="text-lg font-semibold">
                    {formatMoney(Number(selected.estimated_total || selected.cart_subtotal || 0))}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={selected.status === 'expired' ? 'outline' : 'secondary'}>
                    {selected.status === 'expired'
                      ? t('abandoned.status.expired')
                      : t('abandoned.status.abandoned')}
                  </Badge>
                  {selected.payment_method && (
                    <Badge variant="outline" className="capitalize">
                      {selected.payment_method}
                    </Badge>
                  )}
                  <Badge variant="outline">{formatAbandonedAgo(selected.last_activity_at, nowMs, t)}</Badge>
                </div>
              </div>

              <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
                {t('abandoned.notice')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('abandoned.customerInfo')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><strong>{t('abandoned.field.name')}:</strong> {selected.customer_name || dash}</div>
                    <div><strong>{t('abandoned.field.email')}:</strong> {selected.customer_email || dash}</div>
                    <div><strong>{t('abandoned.field.phone')}:</strong> {selected.customer_phone || dash}</div>
                    <div><strong>{t('abandoned.field.address')}:</strong> {selected.customer_address || dash}</div>
                    {(selected.customer_city || selected.customer_county) && (
                      <div>
                        <strong>{t('abandoned.field.location')}:</strong>{' '}
                        {[selected.customer_city, selected.customer_county].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {selected.delivery_type && (
                      <div><strong>{t('abandoned.field.delivery')}:</strong> {selected.delivery_type}</div>
                    )}
                    {selected.locker_name && (
                      <div><strong>{t('abandoned.field.locker')}:</strong> {selected.locker_name}</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('abandoned.cartActivity')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>
                      <strong>{t('abandoned.field.lastActivity')}:</strong>{' '}
                      {formatDateTime(selected.last_activity_at)}
                    </div>
                    <div>
                      <strong>{t('abandoned.field.started')}:</strong> {formatDateTime(selected.created_at)}
                    </div>
                    <div><strong>{t('abandoned.field.checkoutStep')}:</strong> {selected.checkout_step}</div>
                    <div>
                      <strong>{t('abandoned.field.paymentPreference')}:</strong>{' '}
                      {selected.payment_method || dash}
                    </div>
                    <div>
                      <strong>{t('abandoned.field.estimatedTotal')}:</strong>{' '}
                      {formatMoney(Number(selected.estimated_total || 0))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('abandoned.cartItems')}</CardTitle>
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
                      {formatMoney(Number(selected.estimated_total || selected.cart_subtotal || 0))}
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
