import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Package, Truck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  total: number;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  shipping_status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  created_at: string;
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

  const { data: orders, isLoading } = useQuery({
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
      refunded: 'destructive'
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Shipping</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders?.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-mono text-sm">
                  {order.id.slice(0, 8)}...
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{order.customer_name}</div>
                    <div className="text-sm text-muted-foreground">{order.customer_email}</div>
                  </div>
                </TableCell>
                <TableCell>${order.total}</TableCell>
                <TableCell>
                  <Select
                    value={order.payment_status}
                    onValueChange={(value) => handleStatusUpdate(order.id, 'payment_status', value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={order.shipping_status}
                    onValueChange={(value) => handleStatusUpdate(order.id, 'shipping_status', value)}
                  >
                    <SelectTrigger className="w-32">
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
                </TableCell>
                <TableCell>
                  {new Date(order.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleViewOrder(order)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {orders?.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No orders found. Orders will appear here when customers make purchases.
          </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">Customer Information</h3>
                  <div className="space-y-1 text-sm">
                    <div><strong>Name:</strong> {selectedOrder.customer_name}</div>
                    <div><strong>Email:</strong> {selectedOrder.customer_email}</div>
                    <div><strong>Phone:</strong> {selectedOrder.customer_phone}</div>
                    <div><strong>Address:</strong> {selectedOrder.customer_address}</div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Order Status</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Payment:</span>
                      {getStatusBadge(selectedOrder.payment_status, 'payment')}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Shipping:</span>
                      {getStatusBadge(selectedOrder.shipping_status, 'shipping')}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Order Items</h3>
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
                        <TableCell>{item.product_title}</TableCell>
                        <TableCell>${item.product_price}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>${(item.product_price * item.quantity).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 text-right">
                  <div className="text-lg font-semibold">
                    Total: ${selectedOrder.total}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default OrderManagement;