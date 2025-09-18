import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Package, Truck, X, Receipt, Send, ExternalLink, Edit, Search } from 'lucide-react';
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

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  total: number;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'invoiced';
  shipping_status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  created_at: string;
  invoice_link?: string;
  awb_number?: string;
  carrier_name?: string;
  tracking_url?: string;
  estimated_delivery_date?: string;
}

interface OrderItem {
  id: string;
  product_title: string;
  product_price: number;
  quantity: number;
}

const OrderManagement = () => {
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

      toast.success('Invoice generated and sent to customer successfully');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
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

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Order[];
    }
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string }) => {
      const { data, error } = await supabase
        .from('orders')
        .update({ [field]: value })
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
        body: {
          action: 'cancel_order',
          orderId: orderId
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to cancel AWB');
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
      toast.error(error.message || 'Failed to cancel AWB');
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

  if (isLoading) {
    return <div>Loading orders...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div>
            <CardTitle>Orders</CardTitle>
            <CardDescription>Manage customer orders and fulfillment</CardDescription>
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

      {selectedOrder && (
        <AWBCreationModal
          isOpen={isAWBModalOpen}
          onClose={() => setIsAWBModalOpen(false)}
          order={selectedOrder}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            // Update selected order status
            setSelectedOrder(prev => prev ? { ...prev, shipping_status: 'processing' } : null);
          }}
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
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
                      <Button
                        onClick={() => window.open(selectedOrder.tracking_url, '_blank')}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
                        <Truck className="h-4 w-4 mr-2" />
                        Track Package
                      </Button>
                      {selectedOrder.shipping_status !== 'delivered' && selectedOrder.shipping_status !== 'cancelled' && (
                        <Button
                          onClick={() => handleCancelAWB(selectedOrder.id)}
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive-foreground"
                          disabled={creatingAWB.has(selectedOrder.id)}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel AWB
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
                      Create AWB
                    </Button>
                  )}
                  {selectedOrder.invoice_link && (
                    <Button
                      onClick={() => window.open(selectedOrder.invoice_link, '_blank')}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Invoice
                    </Button>
                  )}
                </div>
              </div>

              {/* Shipping Information */}
              {selectedOrder.awb_number && (
                <div className="mb-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Shipping Information</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-medium text-muted-foreground">AWB Number</p>
                        <p className="font-mono">{selectedOrder.awb_number}</p>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Carrier</p>
                        <p>{selectedOrder.carrier_name}</p>
                      </div>
                      {selectedOrder.estimated_delivery_date && (
                        <div>
                          <p className="font-medium text-muted-foreground">Estimated Delivery</p>
                          <p>{new Date(selectedOrder.estimated_delivery_date).toLocaleDateString()}</p>
                        </div>
                      )}
                      {selectedOrder.tracking_url && (
                        <div>
                          <p className="font-medium text-muted-foreground">Tracking</p>
                          <Button
                            variant="link"
                            className="p-0 h-auto text-primary"
                            onClick={() => window.open(selectedOrder.tracking_url, '_blank')}
                          >
                            View Tracking Details
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
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
                    <div><strong>Address:</strong> {selectedOrder.customer_address}</div>
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
                          <TableHead>Product</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.product_title}</TableCell>
                            <TableCell>{item.product_price.toFixed(2)} RON</TableCell>
                            <TableCell>{item.quantity}</TableCell>
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
                        <div className="font-medium">{item.product_title}</div>
                        <div className="flex justify-between text-sm">
                           <span>{item.product_price.toFixed(2)} RON × {item.quantity}</span>
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
    </Card>
  );
};

export default OrderManagement;