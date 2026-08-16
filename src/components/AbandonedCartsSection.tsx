import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Eye, MoreHorizontal, RefreshCw, ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDateTime } from '@/i18n/format';
import { cn } from '@/lib/utils';
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

type ConfirmMode = 'one' | 'selected' | 'all' | null;

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
  const [detailsCart, setDetailsCart] = useState<AbandonedCartRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);
  const [pendingSingleId, setPendingSingleId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const cartIds = useMemo(() => carts.map((c) => c.id), [carts]);
  const selectedCount = selectedIds.size;
  const allSelected = carts.length > 0 && selectedCount === carts.length;
  const someSelected = selectedCount > 0 && selectedCount < carts.length;
  const hasSelection = selectedCount > 0;

  // Drop selections that no longer exist (realtime / refresh)
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => cartIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [cartIds]);

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

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(cartIds));
    else setSelectedIds(new Set());
  };

  const clearSelection = () => setSelectedIds(new Set());

  const afterSuccessfulDelete = async () => {
    setConfirmMode(null);
    setPendingSingleId(null);
    setSelectedIds(new Set());
    setDetailsOpen(false);
    setDetailsCart(null);
    await queryClient.invalidateQueries({ queryKey: ['abandoned-carts'] });
  };

  const runDelete = async () => {
    if (!confirmMode) return;
    const mode = confirmMode;
    setIsDeleting(true);
    try {
      let query = supabase.from('abandoned_carts' as any).delete();

      if (mode === 'one') {
        if (!pendingSingleId) throw new Error(t('abandoned.toast.deleteFailed'));
        query = query.eq('id', pendingSingleId);
      } else if (mode === 'selected') {
        const ids = [...selectedIds];
        if (ids.length === 0) throw new Error(t('abandoned.toast.deleteFailed'));
        query = query.in('id', ids);
      } else {
        // Clear all currently shown statuses; ownership via RLS
        query = query.in('status', ['active', 'expired']);
      }

      const { error } = await query;
      if (error) throw error;

      await afterSuccessfulDelete();
      toast.success(
        mode === 'one'
          ? t('abandoned.toast.deletedOne')
          : mode === 'selected'
            ? t('abandoned.toast.deletedSelected')
            : t('abandoned.toast.cleared')
      );
    } catch (err: any) {
      console.error('Failed to delete abandoned carts:', err);
      toast.error(
        err?.message ||
          (mode === 'all' ? t('abandoned.toast.clearFailed') : t('abandoned.toast.deleteFailed'))
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const openDeleteOne = (cart: AbandonedCartRow) => {
    setPendingSingleId(cart.id);
    setConfirmMode('one');
  };

  const handleView = (cart: AbandonedCartRow) => {
    setDetailsCart(cart);
    setDetailsOpen(true);
  };

  const detailItems = Array.isArray(detailsCart?.items) ? detailsCart!.items : [];

  const confirmCopy =
    confirmMode === 'one'
      ? {
          title: t('abandoned.confirm.one.title'),
          description: t('abandoned.confirm.one.description'),
          action: t('abandoned.confirm.one.action'),
        }
      : confirmMode === 'selected'
        ? {
            title: t('abandoned.confirm.selected.title'),
            description: t('abandoned.confirm.selected.description'),
            action: t('abandoned.confirm.selected.action'),
          }
        : {
            title: t('abandoned.confirm.all.title'),
            description: t('abandoned.confirm.all.description'),
            action: t('abandoned.confirm.all.action'),
          };

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

              {hasSelection ? (
                <div
                  className={cn(
                    'flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2'
                  )}
                >
                  <span className="text-sm font-medium tabular-nums px-1">
                    {t('abandoned.selectedCount', { count: selectedCount })}
                  </span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isDeleting}
                    onClick={() => setConfirmMode('selected')}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('abandoned.deleteSelected')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    onClick={clearSelection}
                  >
                    {t('abandoned.clearSelection')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isFetching || isDeleting}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                    {t('abandoned.refresh')}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isDeleting}
                        aria-label={t('abandoned.sectionMenuAria')}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={carts.length === 0 || isDeleting}
                        className="text-destructive focus:text-destructive"
                        onClick={() => setConfirmMode('all')}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('abandoned.clearAll')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
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
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                            onCheckedChange={(v) => toggleSelectAll(v === true)}
                            aria-label={t('abandoned.selectAllAria')}
                            disabled={isDeleting}
                          />
                        </TableHead>
                        <TableHead>{t('abandoned.table.customer')}</TableHead>
                        <TableHead className="hidden md:table-cell">{t('abandoned.table.contact')}</TableHead>
                        <TableHead className="hidden lg:table-cell">{t('abandoned.table.products')}</TableHead>
                        <TableHead>{t('abandoned.table.total')}</TableHead>
                        <TableHead>{t('abandoned.table.status')}</TableHead>
                        <TableHead className="hidden sm:table-cell">{t('abandoned.table.lastActivity')}</TableHead>
                        <TableHead className="w-[52px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {carts.map((cart) => {
                        const cartItems = Array.isArray(cart.items) ? cart.items : [];
                        const productSummary = cartItems
                          .map((i) => `${itemTitle(i, itemFallback)} ×${itemQty(i)}`)
                          .join(', ');
                        const isExpired = cart.status === 'expired';
                        const isChecked = selectedIds.has(cart.id);

                        return (
                          <TableRow
                            key={cart.id}
                            className={cn('cursor-pointer', isExpired && 'opacity-70')}
                            data-state={isChecked ? 'selected' : undefined}
                            onClick={() => handleView(cart)}
                          >
                            <TableCell
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(v) => toggleRow(cart.id, v === true)}
                                aria-label={t('abandoned.selectRowAria')}
                                disabled={isDeleting}
                              />
                            </TableCell>
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
                                {isExpired
                                  ? t('abandoned.status.expired')
                                  : t('abandoned.status.abandoned')}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm">
                              <div>{formatAbandonedAgo(cart.last_activity_at, nowMs, t)}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(cart.last_activity_at)}
                              </div>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={isDeleting}
                                    aria-label={t('abandoned.rowMenuAria')}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleView(cart)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    {t('abandoned.viewDetails')}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => openDeleteOne(cart)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    {tCommon('delete')}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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

          {detailsCart && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-muted-foreground">
                    {t('abandoned.cartId', { id: detailsCart.id.slice(-8) })}
                  </p>
                  <p className="text-lg font-semibold">
                    {formatMoney(
                      Number(detailsCart.estimated_total || detailsCart.cart_subtotal || 0)
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={detailsCart.status === 'expired' ? 'outline' : 'secondary'}>
                    {detailsCart.status === 'expired'
                      ? t('abandoned.status.expired')
                      : t('abandoned.status.abandoned')}
                  </Badge>
                  {detailsCart.payment_method && (
                    <Badge variant="outline" className="capitalize">
                      {detailsCart.payment_method}
                    </Badge>
                  )}
                  <Badge variant="outline">
                    {formatAbandonedAgo(detailsCart.last_activity_at, nowMs, t)}
                  </Badge>
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
                    <div>
                      <strong>{t('abandoned.field.name')}:</strong> {detailsCart.customer_name || dash}
                    </div>
                    <div>
                      <strong>{t('abandoned.field.email')}:</strong>{' '}
                      {detailsCart.customer_email || dash}
                    </div>
                    <div>
                      <strong>{t('abandoned.field.phone')}:</strong>{' '}
                      {detailsCart.customer_phone || dash}
                    </div>
                    <div>
                      <strong>{t('abandoned.field.address')}:</strong>{' '}
                      {detailsCart.customer_address || dash}
                    </div>
                    {(detailsCart.customer_city || detailsCart.customer_county) && (
                      <div>
                        <strong>{t('abandoned.field.location')}:</strong>{' '}
                        {[detailsCart.customer_city, detailsCart.customer_county]
                          .filter(Boolean)
                          .join(', ')}
                      </div>
                    )}
                    {detailsCart.delivery_type && (
                      <div>
                        <strong>{t('abandoned.field.delivery')}:</strong> {detailsCart.delivery_type}
                      </div>
                    )}
                    {detailsCart.locker_name && (
                      <div>
                        <strong>{t('abandoned.field.locker')}:</strong> {detailsCart.locker_name}
                      </div>
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
                      {formatDateTime(detailsCart.last_activity_at)}
                    </div>
                    <div>
                      <strong>{t('abandoned.field.started')}:</strong>{' '}
                      {formatDateTime(detailsCart.created_at)}
                    </div>
                    <div>
                      <strong>{t('abandoned.field.checkoutStep')}:</strong>{' '}
                      {detailsCart.checkout_step}
                    </div>
                    <div>
                      <strong>{t('abandoned.field.paymentPreference')}:</strong>{' '}
                      {detailsCart.payment_method || dash}
                    </div>
                    <div>
                      <strong>{t('abandoned.field.estimatedTotal')}:</strong>{' '}
                      {formatMoney(Number(detailsCart.estimated_total || 0))}
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
                        {detailItems.map((item, idx) => (
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
                    {detailItems.map((item, idx) => (
                      <div
                        key={`${itemTitle(item, itemFallback)}-${idx}`}
                        className="border rounded-md p-3 text-sm"
                      >
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
                      {formatMoney(
                        Number(detailsCart.estimated_total || detailsCart.cart_subtotal || 0)
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmMode !== null}
        onOpenChange={(next) => {
          if (isDeleting) return;
          if (!next) {
            setConfirmMode(null);
            setPendingSingleId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy.title}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {confirmCopy.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                void runDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirmCopy.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
