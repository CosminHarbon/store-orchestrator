import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Package, Truck, X, Receipt, Send, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ResponsiveOrderTable } from './ResponsiveOrderTable';

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
  
  const queryClient = useQueryClient();

  const generateInvoice = async (orderId: string) => {
    try {
      const response = await supabase.functions.invoke('oblio-invoice', {
        body: {
          orderId,
          action: 'generate'
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success('Invoice generated successfully');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error: any) {
      console.error('Error generating invoice:', error);
      toast.error(error.message || 'Failed to generate invoice');
    }
  };

  const sendInvoice = async (orderId: string) => {
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

      toast.success('Invoice sent to customer successfully');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error: any) {
      console.error('Error sending invoice:', error);
      toast.error(error.message || 'Failed to send invoice');
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update order');
      console.error(error);
    }
  });

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

  if (isLoading) {
    return <div>Loading orders...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders</CardTitle>
        <CardDescription>Manage customer orders and fulfillment</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveOrderTable
          orders={orders || []}
          onViewOrder={handleViewOrder}
          generateInvoice={generateInvoice}
          sendInvoice={sendInvoice}
        />
        {orders?.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <div className="space-y-2">
              <p>No orders found.</p>
              <p className="text-sm">Orders will appear here when customers make purchases.</p>
            </div>
          </div>
        )}
      </CardContent>

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
                    <p className="text-lg font-semibold">${selectedOrder.total}</p>
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
                    onClick={() => generateInvoice(selectedOrder.id)}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <Receipt className="h-4 w-4 mr-2" />
                    Generate Invoice
                  </Button>
                  <Button
                    onClick={() => sendInvoice(selectedOrder.id)}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Invoice
                  </Button>
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
                    <div><strong>Total Amount:</strong> ${selectedOrder.total}</div>
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
                            <TableCell>${item.product_price}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>${(item.product_price * item.quantity).toFixed(2)}</TableCell>
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
                          <span>${item.product_price} × {item.quantity}</span>
                          <span className="font-medium">${(item.product_price * item.quantity).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total:</span>
                      <span className="text-lg font-semibold">${selectedOrder.total}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default OrderManagement;