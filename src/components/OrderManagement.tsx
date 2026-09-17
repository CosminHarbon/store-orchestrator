import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Package, PackageX, RotateCcw, Truck, X, Receipt, Send, ExternalLink, Edit, Search, CreditCard, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ExportDialog } from '@/components/export/ExportDialog';
import type { ExportRow } from '@/lib/export/types';
import { ResponsiveOrderTable } from './ResponsiveOrderTable';
import { AWBCreationModal } from './AWBCreationModal';
import { PendingCheckoutsSection } from './PendingCheckoutsSection';
import { AbandonedCartsSection } from './AbandonedCartsSection';
import { CodOrderBanner, ShippingSummaryCard } from '@/components/shipping/ShippingSummaryCard';
import { useImpersonation, resolveTenantUserId } from '@/hooks/useImpersonation';
import { withActingAsUserId } from '@/lib/actingAs';

interface StockShortfallEntry {
  product_id: string;
  product_title: string;
  variant_id?: string | null;
  variant_title?: string | null;
  requested: number;
  applied: number;
  missing: number;
  reason?: string;
}

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  customer_city?: string | null;
  customer_county?: string | null;
  billing_same_as_delivery?: boolean | null;
  billing_address?: string | null;
  billing_city?: string | null;
  billing_county?: string | null;
  billing_street?: string | null;
  billing_street_number?: string | null;
  billing_block?: string | null;
  billing_apartment?: string | null;
  delivery_type?: 'home' | 'locker' | string | null;
  selected_carrier_code?: string | null;
  locker_id?: string | null;
  locker_name?: string | null;
  locker_address?: string | null;
  total: number;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'invoiced' | 'cash';
  shipping_status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  order_status?: 'draft' | 'awaiting_payment' | 'paid' | 'cancelled' | null;
  stock_applied_at?: string | null;
  stock_restored_at?: string | null;
  return_status?: 'none' | 'partial' | 'returned' | string | null;
  stock_shortfall?: unknown;
  created_at: string;
  invoice_link?: string;
  awb_number?: string;
  carrier_name?: string;
  tracking_url?: string;
  estimated_delivery_date?: string;
  awb_label_url?: string | null;
  awb_service_name?: string | null;
  awb_service_id?: number | null;
  awb_carrier_id?: number | null;
  awb_shipping_cost?: number | null;
  awb_cod_amount?: number | null;
  locker_deposit_code?: string | null;
  customer_notes?: string | null;
  delivery_fee?: number | null;
  delivery_distance_km?: number | null;
  delivery_pricing_snapshot?: {
    method?: string;
    provider?: string;
    county?: string;
    locality?: string;
    distance_km?: number;
    quantity?: number;
    price_per_unit?: number;
    delivery_fee?: number;
  } | null;
}

const readStockShortfall = (order: Order): StockShortfallEntry[] =>
  Array.isArray(order.stock_shortfall) ? (order.stock_shortfall as StockShortfallEntry[]) : [];

interface OrderItem {
  id: string;
  product_title: string;
  product_price: number;
  quantity: number;
  returned_quantity?: number;
  variant_id?: string | null;
  variant_title?: string | null;
  variant_sku?: string | null;
  variant_options?: { name?: string; value?: string }[] | null;
  image_url?: string | null;
}

function orderItemVariantLabel(item: OrderItem): string {
  if (item.variant_title) return item.variant_title;
  if (Array.isArray(item.variant_options) && item.variant_options.length) {
    return item.variant_options
      .map((entry) => (entry.name && entry.value ? `${entry.name}: ${entry.value}` : entry.value || ''))
      .filter(Boolean)
      .join(' · ');
  }
  return '';
}

const OrderManagement = () => {
  const { t: tExport } = useTranslation('export');
  const { t } = useTranslation('orders');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editFormData, setEditFormData] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_address: ''
  });
  const [refreshingPayments, setRefreshingPayments] = useState<Set<string>>(new Set());
  const [restockingOrders, setRestockingOrders] = useState<Set<string>>(new Set());
  const [creatingAWB, setCreatingAWB] = useState<Set<string>>(new Set());
  const [isAWBModalOpen, setIsAWBModalOpen] = useState(false);
  const [dashboardRequestedOrderId, setDashboardRequestedOrderId] = useState<string | null>(null);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  const [returnQtyByItem, setReturnQtyByItem] = useState<Record<string, number>>({});
  const [returnMarkRefunded, setReturnMarkRefunded] = useState(false);
  const [returnCancelIfFull, setReturnCancelIfFull] = useState(true);
  const [returnNotes, setReturnNotes] = useState('');
  const [returningOrder, setReturningOrder] = useState(false);
  
  const queryClient = useQueryClient();
  const { effectiveUserId } = useImpersonation();

  const generateAndSendInvoice = async (orderId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('oblio-invoice', {
        body: withActingAsUserId({
          orderId,
          action: 'send'
        })
      });

      const message =
        data?.error ||
        data?.message ||
        error?.message ||
        'Failed to generate and send invoice';

      if (error || data?.success === false) {
        throw new Error(message);
      }

      toast.success('Invoice generated and sent to customer successfully');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      const invoice = data?.invoice?.data;
      if (invoice) {
        setSelectedOrder((prev) =>
          prev && prev.id === orderId
            ? {
                ...prev,
                invoice_link: invoice.link || prev.invoice_link,
                payment_status: 'paid',
              }
            : prev
        );
      }
    } catch (error: any) {
      console.error('Error generating and sending invoice:', error);
      toast.error(error.message || 'Failed to generate and send invoice');
    }
  };

  const handleEditOrder = (order: Order) => {
    console.log('Edit order clicked for:', order);
    setEditingOrder(order);
    setEditFormData({
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      customer_address: order.customer_address
    });
    setIsEditingOrder(true);
    console.log('Edit form data set:', {
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      customer_address: order.customer_address
    });
  };

  const saveOrderChanges = async () => {
    if (!editingOrder) {
      console.log('No editing order found');
      return;
    }
    
    try {
      console.log('Updating order:', editingOrder.id, 'with data:', editFormData);
      
      const { data, error } = await supabase
        .from('orders')
        .update(editFormData)
        .eq('id', editingOrder.id)
        .select();

      if (error) {
        console.error('Update error:', error);
        throw error;
      }

      console.log('Update successful:', data);

      // Update the selected order state if it's the same order
      if (selectedOrder && selectedOrder.id === editingOrder.id) {
        setSelectedOrder({
          ...selectedOrder,
          ...editFormData
        });
      }

      setIsEditingOrder(false);
      setEditingOrder(null);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order details updated successfully');
    } catch (error: any) {
      console.error('Failed to update order:', error);
      toast.error(`Failed to update order details: ${error.message}`);
    }
  };

  const { data: orders, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['orders', effectiveUserId],
    enabled: !!effectiveUserId,
    queryFn: async () => {
      // Hide legacy unpaid card attempts; checkout sessions never become orders until paid
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', effectiveUserId!)
        .or('order_status.is.null,order_status.neq.awaiting_payment')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Order[];
    }
  });

  const handleRefreshOrders = async () => {
    try {
      await refetch();
      toast.success('Orders refreshed');
    } catch {
      toast.error('Failed to refresh orders');
    }
  };

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string }) => {
      const { data, error } = await supabase
        .from('orders')
        .update({ [field]: value } as any)
        .eq('id', id)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order updated successfully');

      // Ensure the open View dialog reflects latest status immediately
      if (data && data[0]) {
        const updated = data[0] as Order;
        setSelectedOrder((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
      }
    },
    onError: (error) => {
      toast.error('Failed to update order');
      console.error(error);
    }
  });

  // Restocking is always an explicit merchant decision: a refund does not mean
  // the goods came back. The RPC returns inventory exactly once.
  const restockMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('restore_order_stock', {
        p_order_id: orderId,
        p_cancel_order: true,
      });

      if (error) throw error;

      const result = data as { success?: boolean; error?: string; already_restored?: boolean } | null;
      if (!result?.success) throw new Error(result?.error || 'Failed to restock items');
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(
        result.already_restored
          ? 'Items had already been restocked'
          : 'Order cancelled and items returned to stock'
      );
      setSelectedOrder((prev) =>
        prev
          ? { ...prev, stock_restored_at: new Date().toISOString(), order_status: 'cancelled' }
          : prev
      );
    },
    onError: (error: any) => {
      console.error('Failed to restock order:', error);
      toast.error(error?.message || 'Failed to restock items');
    },
  });

  const handleCancelAndRestock = async (orderId: string) => {
    const confirmed = window.confirm(
      t('return.confirmCancelRestock')
    );
    if (!confirmed) return;

    setRestockingOrders((prev) => new Set(prev).add(orderId));
    try {
      await restockMutation.mutateAsync(orderId);
    } finally {
      setRestockingOrders((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const openReturnDialog = () => {
    const initial: Record<string, number> = {};
    for (const item of orderItems) {
      const remaining = Math.max(item.quantity - (item.returned_quantity || 0), 0);
      initial[item.id] = remaining;
    }
    setReturnQtyByItem(initial);
    setReturnMarkRefunded(false);
    setReturnCancelIfFull(true);
    setReturnNotes('');
    setIsReturnDialogOpen(true);
  };

  const setReturnAllRemaining = () => {
    const next: Record<string, number> = {};
    for (const item of orderItems) {
      next[item.id] = Math.max(item.quantity - (item.returned_quantity || 0), 0);
    }
    setReturnQtyByItem(next);
  };

  const clearReturnQtys = () => {
    const next: Record<string, number> = {};
    for (const item of orderItems) next[item.id] = 0;
    setReturnQtyByItem(next);
  };

  const returnMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrder) throw new Error('NO_ORDER');
      const items = Object.entries(returnQtyByItem)
        .filter(([, qty]) => qty > 0)
        .map(([order_item_id, quantity]) => ({ order_item_id, quantity }));
      if (!items.length) throw new Error('NO_ITEMS');

      const { data, error } = await supabase.rpc('return_order_items', {
        p_order_id: selectedOrder.id,
        p_items: items,
        p_mark_refunded: returnMarkRefunded,
        p_cancel_if_full: returnCancelIfFull,
        p_notes: returnNotes.trim() || undefined,
      });
      if (error) throw error;
      const result = data as {
        success?: boolean;
        error?: string;
        return_status?: string;
        is_full?: boolean;
      } | null;
      if (!result?.success) throw new Error(result?.error || 'RETURN_FAILED');
      return result;
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(
        result.is_full ? t('return.toastFull') : t('return.toastPartial')
      );
      setIsReturnDialogOpen(false);

      if (selectedOrder) {
        const { data: items } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', selectedOrder.id);
        if (items) setOrderItems(items as OrderItem[]);

        setSelectedOrder((prev) =>
          prev
            ? {
                ...prev,
                return_status: (result.return_status as Order['return_status']) || prev.return_status,
                stock_restored_at: result.is_full
                  ? prev.stock_restored_at || new Date().toISOString()
                  : prev.stock_restored_at,
                order_status: result.is_full && returnCancelIfFull ? 'cancelled' : prev.order_status,
                payment_status: returnMarkRefunded ? 'refunded' : prev.payment_status,
              }
            : prev
        );
      }
    },
    onError: (error: Error) => {
      console.error('Failed to return items:', error);
      const msg =
        error.message === 'NO_ITEMS'
          ? t('return.toastNoItems')
          : error.message === 'QTY_EXCEEDS_REMAINING'
            ? t('return.toastQtyExceeds')
            : error.message || t('return.toastFailed');
      toast.error(msg);
    },
  });

  const handleSubmitReturn = async () => {
    setReturningOrder(true);
    try {
      await returnMutation.mutateAsync();
    } finally {
      setReturningOrder(false);
    }
  };

  const refreshPaymentMutation = useMutation({
    mutationFn: async (orderId: string) => {
      // Get payment transactions for this order
      const { data: transactions, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error || !transactions || transactions.length === 0) {
        throw new Error('No payment transaction found for this order');
      }
      
      const transaction = transactions[0];
      if (!transaction.netopia_payment_id) {
        throw new Error('No payment ID found for this transaction');
      }

      // Call the payment status function
      const { data, error: statusError } = await supabase.functions.invoke('netopia-payment', {
        body: withActingAsUserId({
          action: 'payment_status',
          payment_id: transaction.netopia_payment_id,
          user_id: transaction.user_id
        })
      });

      if (statusError) throw statusError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success("Payment status refreshed");
    },
    onError: (error) => {
      console.error('Error refreshing payment status:', error);
      toast.error("Failed to refresh payment status");
    }
  });

  const handleRefreshPayment = async (orderId: string) => {
    setRefreshingPayments(prev => new Set(prev).add(orderId));
    try {
      await refreshPaymentMutation.mutateAsync(orderId);
    } finally {
      setRefreshingPayments(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const handleManualComplete = async (orderId: string) => {
    try {
      const userId =
        effectiveUserId ||
        (await resolveTenantUserId(async () => (await supabase.auth.getUser()).data.user?.id));

      const { data, error } = await supabase.functions.invoke('netopia-payment', {
        body: withActingAsUserId({
          action: 'manual_update',
          order_id: orderId,
          // Provide user_id as a fallback for edge function auth
          user_id: userId,
        })
      });

      if (error) throw error;
      
      // Optimistically update the open dialog order, if any
      setSelectedOrder((prev) => (prev && prev.id === orderId ? { ...prev, payment_status: 'paid' } : prev));
      
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success("Payment status updated to paid");
    } catch (error) {
      console.error('Error marking payment as completed:', error);
      toast.error("Failed to update payment status");
    }
  };

  const handleCreateAWB = async (orderId: string) => {
    const order = orders?.find(o => o.id === orderId);
    if (!order) {
      toast.error('Order not found');
      return;
    }
    setSelectedOrder(order);
    setIsAWBModalOpen(true);
  };

  const handleCancelAWB = async (orderId: string) => {
    const order = orders?.find(o => o.id === orderId);
    if (!order) {
      toast.error('Order not found');
      return;
    }

    if (!order.awb_number) {
      toast.error('No AWB number found for this order');
      return;
    }

    setCreatingAWB(prev => new Set(prev).add(orderId));
    
    try {
      const { data, error } = await supabase.functions.invoke('eawb-delivery', {
        body: withActingAsUserId({
          action: 'cancel_order',
          order_id: orderId
        })
      });

      if (error) {
        let message = error.message;
        try {
          const body = await (error as any)?.context?.json?.();
          if (body?.message) message = body.message;
          else if (body?.error) message = body.error;
        } catch (_e) { /* ignore */ }
        throw new Error(message);
      }

      if (!data?.success) {
        throw new Error(data?.message || data?.error || 'Failed to cancel AWB');
      }

      toast.success('AWB cancelled successfully');
      
      // Update selected order status if it's the same order
      setSelectedOrder(prev => prev && prev.id === orderId 
        ? { ...prev, shipping_status: 'cancelled' } 
        : prev
      );
      
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error: any) {
      console.error('Error cancelling AWB:', error);
      toast.error(error.message || 'Failed to cancel AWB with carrier');
    } finally {
      setCreatingAWB(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const handleViewOrder = async (order: Order) => {
    setSelectedOrder(order);
    
    // Fetch order items
    const { data: items, error } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', order.id);
    
    if (error) {
      toast.error('Failed to load order items');
      return;
    }
    
    setOrderItems(items as OrderItem[]);
    setIsDialogOpen(true);
  };

  const handleStatusUpdate = (orderId: string, field: 'payment_status' | 'shipping_status', value: string) => {
    updateOrderMutation.mutate({ id: orderId, field, value });
  };

  const getStatusBadge = (status: string, type: 'payment' | 'shipping') => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: 'outline',
      cash: 'outline',
      processing: 'secondary',
      paid: 'default',
      shipped: 'default',
      delivered: 'default',
      failed: 'destructive',
      cancelled: 'destructive',
      refunded: 'destructive',
      invoiced: 'default'
    };

    return (
      <Badge variant={variants[status] || 'outline'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Filter orders based on search query
  const filteredOrders = orders?.filter(order => {
    if (!searchQuery) return true;
    
    const searchLower = searchQuery.toLowerCase();
    return (
      order.customer_name.toLowerCase().includes(searchLower) ||
      order.customer_email.toLowerCase().includes(searchLower) ||
      order.customer_phone?.toLowerCase().includes(searchLower) ||
      order.customer_address.toLowerCase().includes(searchLower) ||
      order.id.toLowerCase().includes(searchLower) ||
      order.payment_status.toLowerCase().includes(searchLower) ||
      order.shipping_status.toLowerCase().includes(searchLower)
    );
  }) || [];

  useEffect(() => {
    const apply = (orderId: string) => setDashboardRequestedOrderId(orderId);
    try {
      const orderId = localStorage.getItem('sv-open-order-id');
      if (orderId) apply(orderId);
    } catch {
      /* ignore */
    }
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id === 'string' && id) {
        apply(id);
        void queryClient.invalidateQueries({ queryKey: ['orders'] });
      }
    };
    window.addEventListener('sv:open-order', onOpen);
    return () => window.removeEventListener('sv:open-order', onOpen);
  }, []);

  useEffect(() => {
    if (!dashboardRequestedOrderId || isLoading || !effectiveUserId) return;
    const requestedId = dashboardRequestedOrderId;
    const match = orders?.find((order) => order.id === requestedId);
    const clearPending = () => {
      try {
        localStorage.removeItem('sv-open-order-id');
      } catch {
        /* ignore */
      }
      setDashboardRequestedOrderId(null);
    };

    if (match) {
      void handleViewOrder(match);
      clearPending();
      return;
    }

    void (async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('id', requestedId)
        .eq('user_id', effectiveUserId)
        .maybeSingle();
      if (data) {
        void handleViewOrder(data as Order);
      }
      clearPending();
    })();
  }, [dashboardRequestedOrderId, orders, isLoading, effectiveUserId]);


  const exportRows = useMemo<ExportRow[]>(() => {
    return (filteredOrders || []).map((o) => ({
      id: o.id,
      created: o.created_at,
      customer: o.customer_name,
      email: o.customer_email,
      phone: o.customer_phone || '',
      address: o.customer_address || '',
      city: o.customer_city || '',
      county: o.customer_county || '',
      total: Number(o.total).toFixed(2),
      payment_status: o.payment_status,
      shipping_status: o.shipping_status,
      delivery_type: o.delivery_type || '',
      awb: o.awb_number || '',
      carrier: o.carrier_name || '',
    }));
  }, [filteredOrders]);

  const exportSummary = useMemo(() => {
    const total = exportRows.reduce((s, r) => s + Number(r.total || 0), 0);
    return [
      { label: tExport('summary.orders'), value: String(exportRows.length) },
      { label: tExport('summary.totalValue'), value: `${total.toFixed(2)} RON` },
    ];
  }, [exportRows, tExport]);

  if (isLoading) {
    return <div>Loading orders...</div>;
  }

  return (
    <div className="space-y-4">
      <AbandonedCartsSection />
      <PendingCheckoutsSection />

      <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center gap-3">
            <div>
              <CardTitle>Orders</CardTitle>
              <CardDescription>Manage customer orders and fulfillment</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExportOpen(true)}
              >
                <Download className="h-4 w-4 mr-2" />
                {tExport('open')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefreshOrders}
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredOrders.some((order) => readStockShortfall(order).length > 0) && (
          <div className="mb-4 rounded-md border border-amber-500 bg-amber-500/15 p-3">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Stock shortfall on {
                filteredOrders.filter((order) => readStockShortfall(order).length > 0).length
              } paid order(s)
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              A card payment was captured after stock ran out, or a line could not be fulfilled.
              Open the order — the shortage is recorded on it and will not correct itself.
            </p>
          </div>
        )}
        <ResponsiveOrderTable
          orders={filteredOrders}
          onViewOrder={handleViewOrder}
          generateAndSendInvoice={generateAndSendInvoice}
          onEditOrder={handleEditOrder}
          onRefreshPayment={handleRefreshPayment}
          refreshingPayments={refreshingPayments}
          onManualComplete={handleManualComplete}
          onCancelAWB={handleCancelAWB}
          creatingAWB={creatingAWB}
          onCreateAWB={handleCreateAWB}
        />
        {filteredOrders.length === 0 && !searchQuery && (
          <div className="text-center py-8 text-muted-foreground">
            <div className="space-y-2">
              <p>No orders found.</p>
              <p className="text-sm">Orders will appear here when customers make purchases.</p>
            </div>
          </div>
        )}
        {filteredOrders.length === 0 && searchQuery && (
          <div className="text-center py-8 text-muted-foreground">
            <div className="space-y-2">
              <p>No orders match your search.</p>
              <p className="text-sm">Try adjusting your search terms.</p>
            </div>
          </div>
        )}
      </CardContent>
      </Card>

      {selectedOrder && (
        <AWBCreationModal
          isOpen={isAWBModalOpen}
          onClose={() => setIsAWBModalOpen(false)}
          order={selectedOrder}
          onSuccess={(result) => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            setSelectedOrder((prev) =>
              prev
                ? {
                    ...prev,
                    shipping_status: 'shipped',
                    awb_number: result?.awb_number || prev.awb_number,
                    tracking_url: result?.tracking_url || prev.tracking_url,
                    awb_label_url: result?.label_url ?? prev.awb_label_url,
                    locker_deposit_code: result?.locker_deposit_code ?? prev.locker_deposit_code,
                    awb_cod_amount: result?.cod_amount ?? prev.awb_cod_amount,
                    carrier_name: result?.carrier_name || prev.carrier_name,
                    awb_service_name: result?.service_name ?? prev.awb_service_name,
                    awb_shipping_cost: result?.shipping_cost ?? prev.awb_shipping_cost,
                    estimated_delivery_date: result?.estimated_delivery_date || prev.estimated_delivery_date,
                  }
                : null
            );
          }}
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl w-[calc(100vw-1.25rem)] max-h-[min(92dvh,920px)] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0 px-4 sm:px-6 pt-5 pb-3 pr-12 border-b text-left">
            <DialogTitle className="text-lg md:text-xl">Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-6">
              {/* Order Summary */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div>
                    <p className="font-mono text-sm text-muted-foreground">Order #{selectedOrder.id.slice(-8)}</p>
                    <p className="text-lg font-semibold">{selectedOrder.total.toFixed(2)} RON</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Payment Status</p>
                      <Select
                        value={selectedOrder.payment_status}
                        onValueChange={(value) => handleStatusUpdate(selectedOrder.id, 'payment_status', value)}
                      >
                        <SelectTrigger className="w-full sm:w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                          <SelectItem value="refunded">Refunded</SelectItem>
                          <SelectItem value="invoiced">Invoiced</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Shipping Status</p>
                      <Select
                        value={selectedOrder.shipping_status}
                        onValueChange={(value) => handleStatusUpdate(selectedOrder.id, 'shipping_status', value)}
                      >
                        <SelectTrigger className="w-full sm:w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="processing">Processing</SelectItem>
                          <SelectItem value="shipped">Shipped</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Inventory / Returns */}
                <div className="mt-4 rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{t('return.inventoryTitle')}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedOrder.return_status === 'returned' || selectedOrder.stock_restored_at
                          ? t('return.itemsReturnedOn', {
                              date: new Date(
                                selectedOrder.stock_restored_at || selectedOrder.created_at
                              ).toLocaleString(),
                            })
                          : selectedOrder.return_status === 'partial'
                            ? t('return.partialReturned')
                            : selectedOrder.stock_applied_at
                              ? t('return.stockCommittedOn', {
                                  date: new Date(selectedOrder.stock_applied_at).toLocaleString(),
                                })
                              : t('return.noStockCommitted')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedOrder.stock_applied_at &&
                        selectedOrder.return_status !== 'returned' &&
                        !selectedOrder.stock_restored_at && (
                          <Button
                            onClick={openReturnDialog}
                            variant="outline"
                            size="sm"
                            disabled={returningOrder}
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            {t('return.button')}
                          </Button>
                        )}
                      {selectedOrder.stock_applied_at && !selectedOrder.stock_restored_at && (
                        <Button
                          onClick={() => handleCancelAndRestock(selectedOrder.id)}
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive-foreground"
                          disabled={restockingOrders.has(selectedOrder.id)}
                        >
                          <PackageX className="h-4 w-4 mr-2" />
                          {restockingOrders.has(selectedOrder.id)
                            ? t('return.restocking')
                            : t('return.cancelAndRestock')}
                        </Button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">{t('return.refundDoesNotRestock')}</p>

                  {readStockShortfall(selectedOrder).length > 0 && (
                    <div className="rounded-md border-2 border-amber-600 bg-amber-500/20 p-3 text-sm">
                      <p className="font-semibold text-amber-800 dark:text-amber-300">
                        Inventory shortfall — this order could not be fully reserved
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        The customer has already paid. Stock was reduced as far as it would go and
                        the remainder is recorded here so it cannot be missed.
                      </p>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {readStockShortfall(selectedOrder).map((entry) => (
                          <li key={`${entry.product_id}:${entry.variant_id || ''}:${entry.reason || ''}`}>
                            <span className="font-medium text-foreground">{entry.product_title}</span>
                            {entry.variant_title ? (
                              <span className="text-foreground"> — {entry.variant_title}</span>
                            ) : null}
                            {': '}
                            {entry.requested} ordered, {entry.applied} reserved, {entry.missing} short
                            {entry.reason === 'FOREIGN_PRODUCT' ? ' (not a product of this store)' : ''}
                            {entry.reason === 'INSUFFICIENT_STOCK' ? ' (not enough stock)' : ''}
                            {entry.reason === 'INVALID_VARIANT' ? ' (variant no longer valid)' : ''}
                            {entry.reason === 'VARIANT_REQUIRED' ? ' (variant required)' : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Invoice Actions */}
                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <Button
                    onClick={() => handleEditOrder(selectedOrder)}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Order
                  </Button>
                  <Button
                    onClick={() => generateAndSendInvoice(selectedOrder.id)}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={!!selectedOrder.invoice_link}
                  >
                    <Receipt className="h-4 w-4 mr-2" />
                    Generate & Send Invoice
                  </Button>
                  {selectedOrder.awb_number ? (
                    <div className="flex gap-2 flex-1">
                      {selectedOrder.shipping_status !== 'delivered' && selectedOrder.shipping_status !== 'cancelled' && (
                        <Button
                          onClick={() => handleCancelAWB(selectedOrder.id)}
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive-foreground flex-1"
                          disabled={creatingAWB.has(selectedOrder.id)}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel AWB
                        </Button>
                      )}
                    </div>
                  ) : selectedOrder.delivery_pricing_snapshot?.provider === 'manual' ? (
                    <div className="flex-1 rounded-md border px-3 py-2 text-sm text-muted-foreground">
                      Own delivery — no AWB
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleCreateAWB(selectedOrder.id)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={selectedOrder.shipping_status === 'delivered' || selectedOrder.shipping_status === 'cancelled'}
                    >
                      <Truck className="h-4 w-4 mr-2" />
                      Create AWB
                    </Button>
                  )}
                  {selectedOrder.invoice_link && (
                    <Button
                      onClick={() => import('@/lib/invoiceUtils').then(m => m.openInvoice(selectedOrder.id, selectedOrder.invoice_link))}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Invoice
                    </Button>
                  )}
                </div>
                
                {/* Payment Actions */}
                {selectedOrder.payment_status === 'pending' && (
                  <div className="flex flex-col sm:flex-row gap-2 mt-2">
                    <Button
                      onClick={() => handleRefreshPayment(selectedOrder.id)}
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      disabled={refreshingPayments.has(selectedOrder.id)}
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      {refreshingPayments.has(selectedOrder.id) ? 'Checking...' : 'Check Payment Status'}
                    </Button>
                    <Button
                      onClick={() => handleManualComplete(selectedOrder.id)}
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Mark as Paid
                    </Button>
                  </div>
                )}
              </div>

              <CodOrderBanner order={selectedOrder} />

              {/* Shipping Summary — central panel after AWB */}
              {selectedOrder.awb_number && (
                <div className="mb-6">
                  <ShippingSummaryCard
                    order={selectedOrder}
                    cancelling={creatingAWB.has(selectedOrder.id)}
                    onCancel={() => handleCancelAWB(selectedOrder.id)}
                    onRegenerate={() => {
                      // Allow creating a new AWB after cancel; if still active, open modal for replacement flow
                      if (selectedOrder.shipping_status === 'cancelled' || !selectedOrder.awb_number) {
                        handleCreateAWB(selectedOrder.id);
                        return;
                      }
                      toast.message('Cancel the current AWB first, then generate a new one.');
                    }}
                  />
                </div>
              )}

              {/* Customer Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Customer Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><strong>Name:</strong> {selectedOrder.customer_name}</div>
                    <div><strong>Email:</strong> {selectedOrder.customer_email}</div>
                    <div><strong>Phone:</strong> {selectedOrder.customer_phone}</div>
                    {selectedOrder.delivery_type === 'locker' ? (
                      <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 mt-2">
                        <div className="font-medium flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Locker Delivery
                        </div>
                        {(selectedOrder.carrier_name || selectedOrder.selected_carrier_code) && (
                          <div className="text-muted-foreground">
                            Courier:{' '}
                            <span className="text-foreground">
                              {selectedOrder.carrier_name || selectedOrder.selected_carrier_code}
                            </span>
                          </div>
                        )}
                        {selectedOrder.locker_name && (
                          <div>
                            <strong>Locker:</strong> {selectedOrder.locker_name}
                          </div>
                        )}
                        {selectedOrder.locker_address && (
                          <div>
                            <strong>Address:</strong> {selectedOrder.locker_address}
                          </div>
                        )}
                        {(selectedOrder.customer_city || selectedOrder.customer_county) && (
                          <div>
                            <strong>Location:</strong>{' '}
                            {[selectedOrder.customer_city, selectedOrder.customer_county]
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div><strong>Address:</strong> {selectedOrder.customer_address}</div>
                    )}
                    {(selectedOrder.billing_address || selectedOrder.billing_city) && (
                      <div className="rounded-lg border bg-muted/30 p-3 mt-2 space-y-1">
                        <div className="font-medium">Invoice / billing address</div>
                        {selectedOrder.billing_same_as_delivery && selectedOrder.delivery_type !== 'locker' ? (
                          <div className="text-muted-foreground">Same as delivery address</div>
                        ) : null}
                        <div>
                          {selectedOrder.billing_address ||
                            [
                              selectedOrder.billing_street,
                              selectedOrder.billing_street_number,
                              selectedOrder.billing_city,
                              selectedOrder.billing_county,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                        </div>
                      </div>
                    )}
                    {selectedOrder.customer_notes && (
                      <div className="rounded-lg border bg-muted/30 p-3 mt-2">
                        <div className="font-medium">Order notes</div>
                        <p className="text-muted-foreground whitespace-pre-wrap mt-1">
                          {selectedOrder.customer_notes}
                        </p>
                      </div>
                    )}
                    {selectedOrder.delivery_pricing_snapshot && (
                      <div className="rounded-lg border bg-muted/30 p-3 mt-2 space-y-1">
                        <div className="font-medium">Delivery pricing</div>
                        {selectedOrder.delivery_distance_km != null && (
                          <div>
                            Distance: {Number(selectedOrder.delivery_distance_km).toFixed(1)} km
                          </div>
                        )}
                        {selectedOrder.delivery_pricing_snapshot.county && (
                          <div>
                            Area: {[
                              selectedOrder.delivery_pricing_snapshot.locality,
                              selectedOrder.delivery_pricing_snapshot.county,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                        )}
                        {selectedOrder.delivery_fee != null && (
                          <div>Delivery fee: {Number(selectedOrder.delivery_fee).toFixed(2)} RON</div>
                        )}
                        {selectedOrder.delivery_pricing_snapshot.price_per_unit != null && (
                          <div>
                            {Number(selectedOrder.delivery_pricing_snapshot.price_per_unit).toFixed(2)} RON
                            {' × '}
                            {selectedOrder.delivery_pricing_snapshot.quantity || 1}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Order Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><strong>Order Date:</strong> {new Date(selectedOrder.created_at).toLocaleString()}</div>
                    <div><strong>Order ID:</strong> <span className="font-mono">{selectedOrder.id}</span></div>
                    <div><strong>Total Amount:</strong> {selectedOrder.total.toFixed(2)} RON</div>
                    <div><strong>Items:</strong> {orderItems.length} product(s)</div>
                  </CardContent>
                </Card>
              </div>

              {/* Order Items */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Order Items</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('table.product')}</TableHead>
                          <TableHead>{t('table.price')}</TableHead>
                          <TableHead>{t('table.quantity')}</TableHead>
                          <TableHead>{t('return.returnedCol')}</TableHead>
                          <TableHead>{t('table.total')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-3">
                                {item.image_url ? (
                                  <img
                                    src={item.image_url}
                                    alt=""
                                    className="h-10 w-10 rounded object-cover shrink-0 bg-muted"
                                  />
                                ) : null}
                                <div>
                                  <div>{item.product_title}</div>
                                  {orderItemVariantLabel(item) ? (
                                    <div className="text-xs text-muted-foreground font-normal mt-0.5">
                                      {orderItemVariantLabel(item)}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{item.product_price.toFixed(2)} RON</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>
                              {(item.returned_quantity || 0) > 0 ? (
                                <Badge variant="secondary">
                                  {item.returned_quantity}/{item.quantity}
                                </Badge>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell>{(item.product_price * item.quantity).toFixed(2)} RON</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {orderItems.map((item) => (
                      <div key={item.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-3">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt=""
                              className="h-10 w-10 rounded object-cover shrink-0 bg-muted"
                            />
                          ) : null}
                          <div>
                            <div className="font-medium">{item.product_title}</div>
                            {orderItemVariantLabel(item) ? (
                              <div className="text-xs text-muted-foreground">{orderItemVariantLabel(item)}</div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex justify-between text-sm">
                           <span>
                             {item.product_price.toFixed(2)} RON × {item.quantity}
                             {(item.returned_quantity || 0) > 0
                               ? ` · ${t('return.returnedShort', { count: item.returned_quantity })}`
                               : ''}
                           </span>
                           <span className="font-medium">{(item.product_price * item.quantity).toFixed(2)} RON</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total:</span>
                      <span className="text-lg font-semibold">{selectedOrder.total.toFixed(2)} RON</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Return items dialog (full or partial) */}
      <Dialog open={isReturnDialogOpen} onOpenChange={setIsReturnDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('return.dialogTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('return.dialogHelp')}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={setReturnAllRemaining}>
              {t('return.returnAll')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearReturnQtys}>
              {t('return.clearQty')}
            </Button>
          </div>
          <div className="space-y-3">
            {orderItems.map((item) => {
              const already = item.returned_quantity || 0;
              const remaining = Math.max(item.quantity - already, 0);
              const qty = returnQtyByItem[item.id] ?? 0;
              return (
                <div key={item.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{item.product_title}</p>
                      {orderItemVariantLabel(item) ? (
                        <p className="text-xs text-muted-foreground">{orderItemVariantLabel(item)}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('return.lineMeta', {
                          ordered: item.quantity,
                          returned: already,
                          remaining,
                        })}
                      </p>
                    </div>
                    <div className="w-24 shrink-0 space-y-1">
                      <Label htmlFor={`return-qty-${item.id}`} className="text-xs">
                        {t('return.qtyLabel')}
                      </Label>
                      <Input
                        id={`return-qty-${item.id}`}
                        type="number"
                        min={0}
                        max={remaining}
                        value={qty}
                        disabled={remaining === 0}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          const next = Number.isFinite(raw)
                            ? Math.min(remaining, Math.max(0, Math.floor(raw)))
                            : 0;
                          setReturnQtyByItem((prev) => ({ ...prev, [item.id]: next }));
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="space-y-3 border-t pt-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={returnMarkRefunded}
                onCheckedChange={(checked) => setReturnMarkRefunded(checked === true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{t('return.markRefunded')}</span>
                <span className="block text-xs text-muted-foreground">{t('return.markRefundedHelp')}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={returnCancelIfFull}
                onCheckedChange={(checked) => setReturnCancelIfFull(checked === true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{t('return.cancelIfFull')}</span>
                <span className="block text-xs text-muted-foreground">{t('return.cancelIfFullHelp')}</span>
              </span>
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="return-notes">{t('return.notes')}</Label>
              <Textarea
                id="return-notes"
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value.slice(0, 500))}
                rows={2}
                maxLength={500}
                placeholder={t('return.notesPlaceholder')}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={handleSubmitReturn}
              disabled={
                returningOrder ||
                !Object.values(returnQtyByItem).some((q) => q > 0)
              }
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {returningOrder ? t('return.submitting') : t('return.submit')}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsReturnDialogOpen(false)}
              disabled={returningOrder}
            >
              {t('return.cancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={isEditingOrder} onOpenChange={setIsEditingOrder}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Order Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer_name">Customer Name</Label>
              <Input
                id="customer_name"
                value={editFormData.customer_name}
                onChange={(e) => setEditFormData({ ...editFormData, customer_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_email">Customer Email</Label>
              <Input
                id="customer_email"
                type="email"
                value={editFormData.customer_email}
                onChange={(e) => setEditFormData({ ...editFormData, customer_email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_phone">Customer Phone</Label>
              <Input
                id="customer_phone"
                value={editFormData.customer_phone}
                onChange={(e) => setEditFormData({ ...editFormData, customer_phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_address">Customer Address</Label>
              <Input
                id="customer_address"
                value={editFormData.customer_address}
                onChange={(e) => setEditFormData({ ...editFormData, customer_address: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={saveOrderChanges} className="flex-1">
                Save Changes
              </Button>
              <Button onClick={() => setIsEditingOrder(false)} variant="outline" className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        datasetId="orders"
        rows={exportRows}
        summary={exportSummary}
      />
    </div>
  );
};

export default OrderManagement;