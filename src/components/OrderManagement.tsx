import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Package, Truck, X, Receipt, Send, ExternalLink, Edit, Search, CreditCard, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ResponsiveOrderTable } from './ResponsiveOrderTable';
import { AWBCreationModal } from './AWBCreationModal';
import { PendingCheckoutsSection } from './PendingCheckoutsSection';
import { AbandonedCartsSection } from './AbandonedCartsSection';
import { CodOrderBanner, ShippingSummaryCard } from '@/components/shipping/ShippingSummaryCard';

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  customer_city?: string | null;
  customer_county?: string | null;
  delivery_type?: 'home' | 'locker' | string | null;
  selected_carrier_code?: string | null;
  locker_id?: string | null;
  locker_name?: string | null;
  locker_address?: string | null;
  total: number;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'invoiced' | 'cash';
  shipping_status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
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
}

interface OrderItem {
  id: string;
  product_title: string;
  product_price: number;
  quantity: number;
}

const OrderManagement = () => {
  const { t: tOrders } = useTranslation('orders');
  const { t: tCommon } = useTranslation('common');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
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
  const [creatingAWB, setCreatingAWB] = useState<Set<string>>(new Set());
  const [isAWBModalOpen, setIsAWBModalOpen] = useState(false);
  
  const queryClient = useQueryClient();

  const generateAndSendInvoice = async (orderId: string) => {
    try {
      const response = await supabase.functions.invoke('oblio-invoice', {
        body: {
          orderId,
          action: 'send'
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success(tOrders('toast.invoiceSent'));
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error: any) {
      console.error('Error generating and sending invoice:', error);
      toast.error(error.message || tOrders('toast.invoiceFailed'));
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
      toast.success(tOrders('toast.orderUpdated'));
    } catch (error: any) {
      console.error('Failed to update order:', error);
      toast.error(tOrders('toast.orderUpdateFailed', { message: error.message }));
    }
  };

  const { data: orders, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      // Hide legacy unpaid card attempts; checkout sessions never become orders until paid
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .or('order_status.is.null,order_status.neq.awaiting_payment')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Order[];
    }
  });

  const handleRefreshOrders = async () => {
    try {
      await refetch();
      toast.success(tOrders('toast.ordersRefreshed'));
    } catch {
      toast.error(tOrders('toast.refreshFailed'));
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
      toast.success(tOrders('toast.orderSaved'));

      // Ensure the open View dialog reflects latest status immediately
      if (data && data[0]) {
        const updated = data[0] as Order;
        setSelectedOrder((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
      }
    },
    onError: (error) => {
      toast.error(tOrders('toast.orderSaveFailed'));
      console.error(error);
    }
  });

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
        throw new Error(tOrders('error.noPaymentTx'));
      }
      
      const transaction = transactions[0];
      if (!transaction.netopia_payment_id) {
        throw new Error(tOrders('error.noPaymentId'));
      }

      // Call the payment status function
      const { data, error: statusError } = await supabase.functions.invoke('netopia-payment', {
        body: {
          action: 'payment_status',
          payment_id: transaction.netopia_payment_id,
          user_id: transaction.user_id
        }
      });

      if (statusError) throw statusError;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(tOrders('toast.paymentRefreshed'));
    },
    onError: (error) => {
      console.error('Error refreshing payment status:', error);
      toast.error(tOrders('toast.paymentRefreshFailed'));
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
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      const { data, error } = await supabase.functions.invoke('netopia-payment', {
        body: {
          action: 'manual_update',
          order_id: orderId,
          // Provide user_id as a fallback for edge function auth
          user_id: userId,
        }
      });

      if (error) throw error;
      
      // Optimistically update the open dialog order, if any
      setSelectedOrder((prev) => (prev && prev.id === orderId ? { ...prev, payment_status: 'paid' } : prev));
      
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(tOrders('toast.markedPaid'));
    } catch (error) {
      console.error('Error marking payment as completed:', error);
      toast.error(tOrders('toast.markPaidFailed'));
    }
  };

  const handleCreateAWB = async (orderId: string) => {
    const order = orders?.find(o => o.id === orderId);
    if (!order) {
      toast.error(tOrders('toast.orderNotFound'));
      return;
    }
    setSelectedOrder(order);
    setIsAWBModalOpen(true);
  };

  const handleCancelAWB = async (orderId: string) => {
    const order = orders?.find(o => o.id === orderId);
    if (!order) {
      toast.error(tOrders('toast.orderNotFound'));
      return;
    }

    if (!order.awb_number) {
      toast.error(tOrders('toast.noAwb'));
      return;
    }

    setCreatingAWB(prev => new Set(prev).add(orderId));
    
    try {
      const { data, error } = await supabase.functions.invoke('eawb-delivery', {
        body: {
          action: 'cancel_order',
          order_id: orderId
        }
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
        throw new Error(data?.message || data?.error || tOrders('toast.awbCancelGeneric'));
      }

      toast.success(tOrders('toast.awbCancelled'));
      
      // Update selected order status if it's the same order
      setSelectedOrder(prev => prev && prev.id === orderId 
        ? { ...prev, shipping_status: 'cancelled' } 
        : prev
      );
      
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error: any) {
      console.error('Error cancelling AWB:', error);
      toast.error(error.message || tOrders('toast.awbCancelFailed'));
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
      toast.error(tOrders('toast.loadItemsFailed'));
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
        {tOrders(`status.${status}`, {
          defaultValue: status.charAt(0).toUpperCase() + status.slice(1),
        })}
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

  if (isLoading) {
    return <div>{tOrders('loadingOrders')}</div>;
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
              <CardTitle>{tOrders('title')}</CardTitle>
              <CardDescription>{tOrders('description')}</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefreshOrders}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              {tCommon('refresh')}
            </Button>
          </div>
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={tOrders('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
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
              <p>{tOrders('empty')}</p>
              <p className="text-sm">{tOrders('emptyDescription')}</p>
            </div>
          </div>
        )}
        {filteredOrders.length === 0 && searchQuery && (
          <div className="text-center py-8 text-muted-foreground">
            <div className="space-y-2">
              <p>{tOrders('emptySearch')}</p>
              <p className="text-sm">{tOrders('emptySearchHint')}</p>
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
                  }
                : null
            );
          }}
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl w-[calc(100vw-1.25rem)] max-h-[min(92dvh,920px)] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0 px-4 sm:px-6 pt-5 pb-3 pr-12 border-b text-left">
            <DialogTitle className="text-lg md:text-xl">{tOrders('detailsTitle')}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-6">
              {/* Order Summary */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div>
                    <p className="font-mono text-sm text-muted-foreground">
                      {tOrders('orderId', { id: selectedOrder.id.slice(-8) })}
                    </p>
                    <p className="text-lg font-semibold">{selectedOrder.total.toFixed(2)} {tCommon('ron')}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{tOrders('paymentStatus')}</p>
                      <Select
                        value={selectedOrder.payment_status}
                        onValueChange={(value) => handleStatusUpdate(selectedOrder.id, 'payment_status', value)}
                      >
                        <SelectTrigger className="w-full sm:w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">{tOrders('status.pending')}</SelectItem>
                          <SelectItem value="cash">{tOrders('status.cash')}</SelectItem>
                          <SelectItem value="paid">{tOrders('status.paid')}</SelectItem>
                          <SelectItem value="failed">{tOrders('status.failed')}</SelectItem>
                          <SelectItem value="refunded">{tOrders('status.refunded')}</SelectItem>
                          <SelectItem value="invoiced">{tOrders('status.invoiced')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{tOrders('shippingStatus')}</p>
                      <Select
                        value={selectedOrder.shipping_status}
                        onValueChange={(value) => handleStatusUpdate(selectedOrder.id, 'shipping_status', value)}
                      >
                        <SelectTrigger className="w-full sm:w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">{tOrders('status.pending')}</SelectItem>
                          <SelectItem value="processing">{tOrders('status.processing')}</SelectItem>
                          <SelectItem value="shipped">{tOrders('status.shipped')}</SelectItem>
                          <SelectItem value="delivered">{tOrders('status.delivered')}</SelectItem>
                          <SelectItem value="cancelled">{tOrders('status.cancelled')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
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
                    {tOrders('editOrder')}
                  </Button>
                  <Button
                    onClick={() => generateAndSendInvoice(selectedOrder.id)}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={!!selectedOrder.invoice_link}
                  >
                    <Receipt className="h-4 w-4 mr-2" />
                    {tOrders('generateSendInvoice')}
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
                          {tOrders('cancelAwb')}
                        </Button>
                      )}
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
                      {tOrders('createAwb')}
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
                      {tOrders('viewInvoice')}
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
                      {refreshingPayments.has(selectedOrder.id) ? tOrders('checkingPayment') : tOrders('checkPaymentStatus')}
                    </Button>
                    <Button
                      onClick={() => handleManualComplete(selectedOrder.id)}
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      {tOrders('markAsPaid')}
                    </Button>
                  </div>
                )}
              </div>

              {/* COD banner only before AWB — shipping card already shows COD after */}
              {!selectedOrder.awb_number && <CodOrderBanner order={selectedOrder} />}

              {/* Shipping Summary — central panel after AWB */}
              {selectedOrder.awb_number && (
                <div>
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
                      toast.message(tOrders('toast.cancelAwbFirst'));
                    }}
                  />
                </div>
              )}

              {/* Customer Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{tOrders('customerInfo')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><strong>{tCommon('name')}:</strong> {selectedOrder.customer_name}</div>
                    <div><strong>{tCommon('email')}:</strong> {selectedOrder.customer_email}</div>
                    <div><strong>{tCommon('phone')}:</strong> {selectedOrder.customer_phone}</div>
                    {selectedOrder.delivery_type === 'locker' ? (
                      <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 mt-2">
                        <div className="font-medium flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          {tOrders('lockerDelivery')}
                        </div>
                        {(selectedOrder.carrier_name || selectedOrder.selected_carrier_code) && (
                          <div className="text-muted-foreground">
                            {tOrders('courier')}:{' '}
                            <span className="text-foreground">
                              {selectedOrder.carrier_name || selectedOrder.selected_carrier_code}
                            </span>
                          </div>
                        )}
                        {selectedOrder.locker_name && (
                          <div>
                            <strong>{tOrders('locker')}:</strong> {selectedOrder.locker_name}
                          </div>
                        )}
                        {selectedOrder.locker_address && (
                          <div>
                            <strong>{tCommon('address')}:</strong> {selectedOrder.locker_address}
                          </div>
                        )}
                        {(selectedOrder.customer_city || selectedOrder.customer_county) && (
                          <div>
                            <strong>{tOrders('location')}:</strong>{' '}
                            {[selectedOrder.customer_city, selectedOrder.customer_county]
                              .filter(Boolean)
                              .join(', ')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div><strong>{tCommon('address')}:</strong> {selectedOrder.customer_address}</div>
                    )}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{tOrders('orderInfo')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><strong>{tOrders('orderDate')}:</strong> {new Date(selectedOrder.created_at).toLocaleString()}</div>
                    <div><strong>{tOrders('orderIdLabel')}:</strong> <span className="font-mono">{selectedOrder.id}</span></div>
                    <div><strong>{tOrders('totalAmount')}:</strong> {selectedOrder.total.toFixed(2)} {tCommon('ron')}</div>
                    <div><strong>{tOrders('itemsCount', { count: orderItems.length })}</strong></div>
                  </CardContent>
                </Card>
              </div>

              {/* Order Items */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{tOrders('orderItems')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tOrders('table.product')}</TableHead>
                          <TableHead>{tOrders('table.price')}</TableHead>
                          <TableHead>{tOrders('table.quantity')}</TableHead>
                          <TableHead>{tOrders('table.total')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.product_title}</TableCell>
                            <TableCell>{item.product_price.toFixed(2)} {tCommon('ron')}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>{(item.product_price * item.quantity).toFixed(2)} {tCommon('ron')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {orderItems.map((item) => (
                      <div key={item.id} className="border rounded-lg p-3 space-y-2">
                        <div className="font-medium">{item.product_title}</div>
                        <div className="flex justify-between text-sm">
                           <span>{item.product_price.toFixed(2)} {tCommon('ron')} × {item.quantity}</span>
                           <span className="font-medium">{(item.product_price * item.quantity).toFixed(2)} {tCommon('ron')}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t pb-2">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">{tCommon('total')}:</span>
                      <span className="text-lg font-semibold">{selectedOrder.total.toFixed(2)} {tCommon('ron')}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={isEditingOrder} onOpenChange={setIsEditingOrder}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tOrders('editTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer_name">{tOrders('field.customerName')}</Label>
              <Input
                id="customer_name"
                value={editFormData.customer_name}
                onChange={(e) => setEditFormData({ ...editFormData, customer_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_email">{tOrders('field.customerEmail')}</Label>
              <Input
                id="customer_email"
                type="email"
                value={editFormData.customer_email}
                onChange={(e) => setEditFormData({ ...editFormData, customer_email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_phone">{tOrders('field.customerPhone')}</Label>
              <Input
                id="customer_phone"
                value={editFormData.customer_phone}
                onChange={(e) => setEditFormData({ ...editFormData, customer_phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_address">{tOrders('field.customerAddress')}</Label>
              <Input
                id="customer_address"
                value={editFormData.customer_address}
                onChange={(e) => setEditFormData({ ...editFormData, customer_address: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={saveOrderChanges} className="flex-1">
                {tCommon('saveChanges')}
              </Button>
              <Button onClick={() => setIsEditingOrder(false)} variant="outline" className="flex-1">
                {tCommon('cancel')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrderManagement;