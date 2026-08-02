import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Eye, RefreshCw, Clock, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

function formatRemaining(expiresAt: string, nowMs: number): { label: string; expired: boolean } {
  const remainingMs = new Date(expiresAt).getTime() - nowMs;
  if (remainingMs <= 0) {
    return { label: 'Expired', expired: true };
  }
  const totalMinutes = Math.ceil(remainingMs / 60000);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return { label: mins > 0 ? `${hours}h ${mins}m remaining` : `${hours}h remaining`, expired: false };
  }
  return { label: `${totalMinutes}m remaining`, expired: false };
}

function itemTitle(item: CheckoutSessionItem) {
  return item.title || item.product_title || 'Item';
}

function itemPrice(item: CheckoutSessionItem) {
  return Number(item.price ?? item.product_price ?? 0);
}

function itemQty(item: CheckoutSessionItem) {
  return Number(item.quantity ?? 1);
}

export function PendingCheckoutsSection() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [selected, setSelected] = useState<CheckoutSessionRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  // Expand by default when there are active pending sessions; stay collapsed when empty
  useEffect(() => {
    if (pendingCount > 0) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [pendingCount]);

  // Countdown tick (display only — does not refetch the list)
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Live updates when a session converts / expires or a new order appears
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
      toast.success('Pending card payments refreshed');
    } catch {
      toast.error('Failed to refresh pending card payments');
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
                        ? `Pending Card Payments (${pendingCount})`
                        : 'Pending Card Payments'}
                    </CardTitle>
                    <CardDescription>
                      Only customers who reached the Netopia payment page are shown here. Cash/COD
                      orders appear in Orders immediately.
                    </CardDescription>
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
                Refresh
              </Button>
            </div>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="pt-0">
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-4">Loading pending checkouts...</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No pending card checkouts right now.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead className="hidden md:table-cell">Contact</TableHead>
                        <TableHead className="hidden lg:table-cell">Products</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead className="hidden sm:table-cell">Payment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden sm:table-cell">Expires</TableHead>
                        <TableHead className="w-[70px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessions.map((session) => {
                        const countdown = formatRemaining(session.expires_at, nowMs);
                        const isExpired = session.status === 'expired' || countdown.expired;
                        const sessionItems = Array.isArray(session.items) ? session.items : [];
                        const productSummary = sessionItems
                          .map((i) => `${itemTitle(i)} ×${itemQty(i)}`)
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
                              <div className="text-muted-foreground">{session.customer_phone || '—'}</div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-sm max-w-[240px] truncate" title={productSummary}>
                              {productSummary || '—'}
                            </TableCell>
                            <TableCell className="font-medium whitespace-nowrap">
                              {Number(session.total).toFixed(2)} RON
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm">
                              <Badge variant="outline" className="capitalize">
                                {session.payment_method === 'card' || !session.payment_method
                                  ? 'Card'
                                  : session.payment_method}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={isExpired ? 'outline' : 'secondary'}>
                                {isExpired ? 'Expired' : 'Pending'}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                {countdown.label}
                              </span>
                              <div className="text-xs text-muted-foreground">
                                {new Date(session.created_at).toLocaleString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleView(session)}
                                aria-label="View checkout session"
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
              Pending Checkout Details
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-muted-foreground">
                    Session #{selected.id.slice(-8)}
                  </p>
                  <p className="text-lg font-semibold">{Number(selected.total).toFixed(2)} RON</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const countdown = formatRemaining(selected.expires_at, nowMs);
                    const isExpired = selected.status === 'expired' || countdown.expired;
                    return (
                      <>
                        <Badge variant={isExpired ? 'outline' : 'secondary'}>
                          {isExpired ? 'Expired' : 'Pending'}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {selected.payment_method === 'card' || !selected.payment_method
                            ? 'Card'
                            : selected.payment_method}
                        </Badge>
                        <Badge variant="outline">{countdown.label}</Badge>
                      </>
                    );
                  })()}
                </div>
              </div>

              <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
                This is a checkout session, not an order. Invoice, AWB and fulfilment actions become
                available only after payment is completed.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Customer Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><strong>Name:</strong> {selected.customer_name}</div>
                    <div><strong>Email:</strong> {selected.customer_email}</div>
                    <div><strong>Phone:</strong> {selected.customer_phone || '—'}</div>
                    <div><strong>Address:</strong> {selected.customer_address}</div>
                    {selected.delivery_type && (
                      <div><strong>Delivery:</strong> {selected.delivery_type}</div>
                    )}
                    {selected.locker_name && (
                      <div><strong>Locker:</strong> {selected.locker_name}</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Checkout Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><strong>Started:</strong> {new Date(selected.created_at).toLocaleString()}</div>
                    <div><strong>Expires:</strong> {new Date(selected.expires_at).toLocaleString()}</div>
                    <div><strong>Payment method:</strong> {selected.payment_method || 'card'}</div>
                    <div><strong>Session ID:</strong> <span className="font-mono text-xs">{selected.id}</span></div>
                    <div><strong>Total:</strong> {Number(selected.total).toFixed(2)} RON</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Cart Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, idx) => (
                          <TableRow key={`${itemTitle(item)}-${idx}`}>
                            <TableCell>{itemTitle(item)}</TableCell>
                            <TableCell>{itemPrice(item).toFixed(2)} RON</TableCell>
                            <TableCell>{itemQty(item)}</TableCell>
                            <TableCell>
                              {(itemPrice(item) * itemQty(item)).toFixed(2)} RON
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="md:hidden space-y-3">
                    {items.map((item, idx) => (
                      <div key={`${itemTitle(item)}-${idx}`} className="border rounded-md p-3 text-sm">
                        <div className="font-medium">{itemTitle(item)}</div>
                        <div className="text-muted-foreground">
                          {itemQty(item)} × {itemPrice(item).toFixed(2)} RON ={' '}
                          {(itemPrice(item) * itemQty(item)).toFixed(2)} RON
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-4 pt-3 border-t">
                    <span className="text-lg font-semibold">
                      {Number(selected.total).toFixed(2)} RON
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
