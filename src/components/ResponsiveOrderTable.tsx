import { Eye, Package, User, Mail, Phone, MapPin, Truck, Receipt, ExternalLink, Edit, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { openInvoice } from '@/lib/invoiceUtils';
import { formatDateTime } from '@/i18n/format';

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_address: string;
  customer_phone?: string;
  total: number;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'invoiced' | 'cash';
  shipping_status: string;
  created_at: string;
  invoice_link?: string;
  awb_number?: string;
  carrier_name?: string;
  tracking_url?: string;
}

interface ResponsiveOrderTableProps {
  orders: Order[];
  onViewOrder: (order: Order) => void;
  generateAndSendInvoice: (orderId: string) => void;
  onEditOrder?: (order: Order) => void;
  onRefreshPayment: (orderId: string) => void;
  refreshingPayments: Set<string>;
  onManualComplete: (orderId: string) => void;
  onCancelAWB?: (orderId: string) => void;
  creatingAWB?: Set<string>;
  onCreateAWB?: (orderId: string) => void;
}

export function ResponsiveOrderTable({ orders, onViewOrder, generateAndSendInvoice, onEditOrder, onRefreshPayment, refreshingPayments, onManualComplete, onCancelAWB, creatingAWB, onCreateAWB }: ResponsiveOrderTableProps) {
  const { t } = useTranslation('orders');
  const { t: tCommon } = useTranslation('common');

  const handleManualComplete = (orderId: string) => {
    onManualComplete(orderId);
  };

  const getStatusBadge = (status: string, type: 'payment' | 'shipping', isMobile: boolean = false) => {
    const baseClasses = "text-xs";
    const key = status.toLowerCase();
    const statusKey = `status.${key}` as const;

    if (type === 'payment') {
      switch (key) {
        case 'pending':
          return (
            <Badge variant="secondary" className={`${baseClasses} px-2 py-0.5`}>
              {isMobile ? t(statusKey) : t('pendingPayment')}
            </Badge>
          );
        case 'cash':
          return <Badge variant="outline" className={`${baseClasses} px-2 py-0.5`}>{t(statusKey)}</Badge>;
        case 'paid':
          return <Badge variant="default" className={baseClasses}>{t(statusKey)}</Badge>;
        case 'failed':
          return <Badge variant="destructive" className={baseClasses}>{t(statusKey)}</Badge>;
        case 'invoiced':
          return <Badge variant="outline" className={baseClasses}>{t(statusKey)}</Badge>;
        default:
          return <Badge variant="outline" className={baseClasses}>{status}</Badge>;
      }
    }

    switch (key) {
      case 'pending':
      case 'processing':
      case 'shipped':
      case 'delivered':
      case 'cancelled':
        return <Badge variant={key === 'pending' ? 'secondary' : 'default'} className={baseClasses}>{t(statusKey)}</Badge>;
      default:
        return <Badge variant="outline" className={baseClasses}>{status}</Badge>;
    }
  };

  const formatOrderDate = (dateString: string) =>
    formatDateTime(dateString, { month: 'short' });

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.orderId')}</TableHead>
              <TableHead>{t('table.customer')}</TableHead>
              <TableHead>{t('table.contact')}</TableHead>
              <TableHead>{t('table.total')}</TableHead>
              <TableHead>{t('table.payment')}</TableHead>
              <TableHead>{t('table.shipping')}</TableHead>
              <TableHead>{t('table.date')}</TableHead>
              <TableHead>{tCommon('actions')}</TableHead>
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
                  {order.total.toFixed(2)} {tCommon('ron')}
                </TableCell>
                <TableCell>
                  {getStatusBadge(order.payment_status, 'payment')}
                </TableCell>
                <TableCell>
                  {getStatusBadge(order.shipping_status, 'shipping')}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatOrderDate(order.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onViewOrder(order)}
                      title={tCommon('view')}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {onEditOrder && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEditOrder(order)}
                        title={t('editOrder')}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                     <Button
                       size="sm"
                       variant="ghost"
                       onClick={() => generateAndSendInvoice(order.id)}
                       title={t('generateSendInvoice')}
                       disabled={!!order.invoice_link}
                     >
                       <Receipt className="h-4 w-4" />
                     </Button>
                     {order.payment_status === 'pending' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRefreshPayment(order.id)}
                          disabled={refreshingPayments.has(order.id)}
                          title={t('checkPaymentStatus')}
                        >
                          {refreshingPayments.has(order.id) ? t('checkingPayment') : '↻'}
                        </Button>
                      )}
                      {order.payment_status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleManualComplete(order.id)}
                          title={t('markAsPaidHint')}
                        >
                          {t('markPaidShort')}
                        </Button>
                      )}
                    {order.invoice_link && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openInvoice(order.id, order.invoice_link)}
                        title={t('viewInvoice')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    {order.awb_number && onCancelAWB && order.shipping_status !== 'delivered' && order.shipping_status !== 'cancelled' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCancelAWB(order.id)}
                        title={t('cancelAwb')}
                        disabled={creatingAWB?.has(order.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
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
                    {formatOrderDate(order.created_at)}
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-lg font-semibold">{order.total.toFixed(2)} {tCommon('ron')}</p>
                  <div className="flex gap-1">
                    {getStatusBadge(order.payment_status, 'payment', true)}
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
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  {getStatusBadge(order.shipping_status, 'shipping')}
                </div>
                
                <div className="flex flex-col gap-3">
                  {/* Primary Action */}
                  <Button
                    size="default"
                    variant="default"
                    onClick={() => onViewOrder(order)}
                    className="w-full"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {t('viewDetails')}
                  </Button>
                  
                  {/* Secondary Actions */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => generateAndSendInvoice(order.id)}
                      disabled={!!order.invoice_link}
                      className="w-full px-2 text-xs"
                    >
                      <Receipt className="h-3.5 w-3.5 mr-1" />
                      {order.invoice_link ? t('sent') : t('invoice')}
                    </Button>
                    
                    {!order.awb_number ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onCreateAWB ? onCreateAWB(order.id) : onViewOrder(order)}
                        disabled={creatingAWB?.has(order.id)}
                        className="w-full px-2 text-xs"
                      >
                        <Package className="h-3.5 w-3.5 mr-1" />
                        {creatingAWB?.has(order.id) ? t('creatingAwb') : t('awbShort')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(order.tracking_url || '#', '_blank')}
                        disabled={!order.tracking_url}
                        className="w-full px-6"
                      >
                        <Truck className="h-4 w-4 mr-2" />
                        {tCommon('track')}
                      </Button>
                    )}
                  </div>
                  
                  {/* Additional Actions Row */}
                  {(order.invoice_link || (order.awb_number && onCancelAWB && order.shipping_status !== 'delivered' && order.shipping_status !== 'cancelled')) && (
                    <div className="flex gap-2">
                      {order.invoice_link && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openInvoice(order.id, order.invoice_link)}
                          className="flex-1"
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          {t('viewInvoice')}
                        </Button>
                      )}
                      {order.awb_number && onCancelAWB && order.shipping_status !== 'delivered' && order.shipping_status !== 'cancelled' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onCancelAWB(order.id)}
                          disabled={creatingAWB?.has(order.id)}
                          className="flex-1 text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4 mr-1" />
                          {t('cancelAwb')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
