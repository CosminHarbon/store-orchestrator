import { Eye, Package, User, Mail, Phone, MapPin, Calendar, CreditCard, Truck, Receipt, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_address: string;
  customer_phone?: string;
  total: number;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'invoiced';
  shipping_status: string;
  created_at: string;
}

interface ResponsiveOrderTableProps {
  orders: Order[];
  onViewOrder: (order: Order) => void;
  generateInvoice: (orderId: string) => void;
  sendInvoice: (orderId: string) => void;
}

export function ResponsiveOrderTable({ orders, onViewOrder, generateInvoice, sendInvoice }: ResponsiveOrderTableProps) {
  const getStatusBadge = (status: string, type: 'payment' | 'shipping') => {
    const baseClasses = "text-xs";
    
    if (type === 'payment') {
      switch (status.toLowerCase()) {
        case 'pending':
          return <Badge variant="secondary" className={baseClasses}>Pending Payment</Badge>;
        case 'paid':
          return <Badge variant="default" className={baseClasses}>Paid</Badge>;
        case 'failed':
          return <Badge variant="destructive" className={baseClasses}>Failed</Badge>;
        case 'invoiced':
          return <Badge variant="outline" className={baseClasses}>Invoiced</Badge>;
        default:
          return <Badge variant="outline" className={baseClasses}>{status}</Badge>;
      }
    } else {
      switch (status.toLowerCase()) {
        case 'pending':
          return <Badge variant="secondary" className={baseClasses}>Pending</Badge>;
        case 'processing':
          return <Badge variant="default" className={baseClasses}>Processing</Badge>;
        case 'shipped':
          return <Badge variant="default" className={baseClasses}>Shipped</Badge>;
        case 'delivered':
          return <Badge variant="default" className={baseClasses}>Delivered</Badge>;
        default:
          return <Badge variant="outline" className={baseClasses}>{status}</Badge>;
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
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
                  #{order.id.slice(-8)}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="font-medium">{order.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{order.customer_email}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {order.customer_phone && (
                      <p className="text-sm">{order.customer_phone}</p>
                    )}
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {order.customer_address}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  ${order.total}
                </TableCell>
                <TableCell>
                  {getStatusBadge(order.payment_status, 'payment')}
                </TableCell>
                <TableCell>
                  {getStatusBadge(order.shipping_status, 'shipping')}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(order.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onViewOrder(order)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => generateInvoice(order.id)}
                      title="Generate Invoice"
                    >
                      <Receipt className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => sendInvoice(order.id)}
                      title="Send Invoice"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-4">
        {orders?.map((order) => (
          <Card key={order.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <CardTitle className="text-base font-mono">
                    #{order.id.slice(-8)}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(order.created_at)}
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-lg font-semibold">${order.total}</p>
                  <div className="flex gap-1">
                    {getStatusBadge(order.payment_status, 'payment')}
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Customer Info */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{order.customer_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{order.customer_email}</span>
                </div>
                {order.customer_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{order.customer_phone}</span>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span className="text-sm">{order.customer_address}</span>
                </div>
              </div>

              <Separator />

              {/* Status and Actions */}
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    {getStatusBadge(order.shipping_status, 'shipping')}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onViewOrder(order)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateInvoice(order.id)}
                  >
                    <Receipt className="h-4 w-4 mr-1" />
                    Invoice
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendInvoice(order.id)}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Send
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}