import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MapPin,
  Package,
  Printer,
  RefreshCw,
  Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatRon, isCashOnDeliveryOrder } from '@/lib/shipping/awbHelpers';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/i18n/format';

export type ShippingOrder = {
  id: string;
  total: number;
  payment_status?: string | null;
  payment_method?: string | null;
  shipping_status?: string | null;
  delivery_type?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  customer_county?: string | null;
  locker_name?: string | null;
  locker_address?: string | null;
  awb_number?: string | null;
  carrier_name?: string | null;
  tracking_url?: string | null;
  estimated_delivery_date?: string | null;
  awb_label_url?: string | null;
  awb_service_name?: string | null;
  awb_service_id?: number | null;
  awb_carrier_id?: number | null;
  awb_shipping_cost?: number | null;
  awb_cod_amount?: number | null;
  locker_deposit_code?: string | null;
  selected_carrier_code?: string | null;
};

interface ShippingSummaryCardProps {
  order: ShippingOrder;
  pickupSummary?: string | null;
  onRegenerate?: () => void;
  onCancel?: () => void;
  cancelling?: boolean;
  className?: string;
}

async function resolveLabelUrl(order: ShippingOrder, labelPdfError: string): Promise<string | null> {
  if (order.awb_label_url) return order.awb_label_url;
  if (!order.awb_number && !order.id) return null;

  const { data, error } = await supabase.functions.invoke('eawb-delivery', {
    body: {
      action: 'get_label_link',
      order_id: order.id,
      awb_number: order.awb_number,
    },
  });
  if (error) throw error;
  if (!data?.success || !data?.download_url) {
    throw new Error(labelPdfError);
  }
  return data.download_url as string;
}

export function ShippingSummaryCard({
  order,
  pickupSummary,
  onRegenerate,
  onCancel,
  cancelling,
  className,
}: ShippingSummaryCardProps) {
  const { t: tShipping } = useTranslation('shipping');
  const { t: tOrders } = useTranslation('orders');
  const { t: tCommon } = useTranslation('common');
  const [busy, setBusy] = useState<'print' | 'download' | null>(null);
  const isCod = isCashOnDeliveryOrder(order);
  const codAmount = order.awb_cod_amount ?? (isCod ? order.total : null);
  const isLocker = order.delivery_type === 'locker';
  const hasAwb = !!order.awb_number;
  const shippingStatus = order.shipping_status || 'shipped';

  const copyText = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(
      () => toast.success(tShipping('summary.toast.copied', { label })),
      () => toast.error(tCommon('couldNotCopy'))
    );
  };

  const deliveryLine = isLocker
    ? [order.locker_name, order.locker_address, order.customer_city, order.customer_county]
        .filter(Boolean)
        .join(' · ')
    : [order.customer_address, order.customer_city, order.customer_county]
        .filter(Boolean)
        .join(', ');

  const openAndMaybePrint = async (print: boolean) => {
    setBusy(print ? 'print' : 'download');
    try {
      const url = await resolveLabelUrl(order, tShipping('summary.error.labelPdf'));
      if (!url) throw new Error(tShipping('summary.error.labelUnavailable'));
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        toast.error(tShipping('summary.toast.popupBlocked'));
        return;
      }
      if (print) {
        try {
          const onLoad = () => {
            try {
              win.focus();
              win.print();
            } catch {
              /* browser blocked auto-print */
            }
          };
          win.addEventListener?.('load', onLoad);
          setTimeout(() => {
            try {
              win.focus();
              win.print();
            } catch {
              /* ignore */
            }
          }, 1200);
        } catch {
          /* ignore */
        }
        toast.success(tShipping('summary.toast.pdfOpenedPrint'));
      } else {
        toast.success(tShipping('summary.toast.labelOpened'));
      }
    } catch (e: any) {
      toast.error(e?.message || tShipping('summary.toast.openFailed'));
    } finally {
      setBusy(null);
    }
  };

  if (!hasAwb) return null;

  return (
    <Card className={cn('border-border overflow-hidden', className)}>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
            </span>
            {tShipping('summary.title')}
          </CardTitle>
          <Badge variant="secondary" className="capitalize">
            {tOrders(`status.${shippingStatus}`, {
              defaultValue: shippingStatus.charAt(0).toUpperCase() + shippingStatus.slice(1),
            })}
          </Badge>
        </div>

        {isCod && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-amber-600 hover:bg-amber-600 text-white border-0">
                {tShipping('summary.cod')}
              </Badge>
              <span className="font-mono text-sm font-semibold text-amber-950 dark:text-amber-100">
                {formatRon(codAmount)}
              </span>
              {isLocker && (
                <span className="text-xs text-amber-800 dark:text-amber-200">
                  {tShipping('summary.codCollected')}
                </span>
              )}
            </div>
          </div>
        )}

        {order.locker_deposit_code && (
          <div className="rounded-xl border-2 border-primary/40 bg-primary/5 px-3 py-3 space-y-2 animate-in fade-in-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {tShipping('summary.depositCode')}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-2xl sm:text-3xl font-mono font-semibold tracking-widest text-foreground">
                {order.locker_deposit_code}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copyText(order.locker_deposit_code!, tShipping('summary.depositCodeLabel'))}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  {tCommon('copy')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const w = window.open('', '_blank');
                    if (!w) return;
                    w.document.write(
                      `<html><body style="font-family:sans-serif;padding:40px;text-align:center"><p>${tShipping('summary.depositCode')}</p><h1 style="font-size:48px;letter-spacing:0.15em">${order.locker_deposit_code}</h1><p>${order.locker_name || ''}</p><script>window.print()</script></body></html>`
                    );
                    w.document.close();
                  }}
                >
                  <Printer className="h-3.5 w-3.5 mr-1.5" />
                  {tCommon('print')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={tShipping('summary.courier')} value={order.carrier_name || order.selected_carrier_code || '—'} />
          <Field
            label={tShipping('summary.service')}
            value={
              order.awb_service_name ||
              (order.awb_service_id != null ? `Service #${order.awb_service_id}` : '—')
            }
          />
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">{tShipping('summary.awbNumber')}</p>
            <div className="flex items-center gap-2">
              <p className="font-mono font-medium">{order.awb_number}</p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => copyText(order.awb_number!, 'AWB')}
                aria-label={tShipping('summary.copyAwb')}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <Field
            label={tShipping('summary.shippingCost')}
            value={
              order.awb_shipping_cost != null ? formatRon(Number(order.awb_shipping_cost)) : '—'
            }
          />
          <Field
            label={isLocker ? tShipping('summary.deliveryLocker') : tShipping('summary.deliveryAddress')}
            value={deliveryLine || '—'}
            icon={isLocker ? <Package className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
          />
          <Field
            label={tShipping('summary.pickup')}
            value={pickupSummary || tShipping('summary.pickupDefault')}
            icon={<Truck className="h-3.5 w-3.5" />}
          />
          {isCod && (
            <Field label={tShipping('summary.codAmount')} value={formatRon(codAmount)} />
          )}
          {order.estimated_delivery_date && (
            <Field
              label={tShipping('summary.estDelivery')}
              value={formatShortDate(order.estimated_delivery_date)}
            />
          )}
        </div>

        {isLocker && isCod && (
          <p className="text-xs text-muted-foreground">
            {order.locker_name ? (
              <>
                {tOrders('locker')}{' '}
                <strong className="text-foreground">{order.locker_name}</strong>
                {' · '}
              </>
            ) : null}
            {tShipping('summary.codLockerHint', { amount: formatRon(codAmount) })}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void openAndMaybePrint(true)}
            disabled={busy !== null}
          >
            {busy === 'print' ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Printer className="h-3.5 w-3.5 mr-1.5" />
            )}
            {tShipping('summary.printAwb')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void openAndMaybePrint(false)}
            disabled={busy !== null}
          >
            {busy === 'download' ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 mr-1.5" />
            )}
            {tShipping('awb.downloadPdf')}
          </Button>
          {order.tracking_url && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.open(order.tracking_url!, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              {tShipping('awb.trackShipment')}
            </Button>
          )}
          {onRegenerate && (
            <Button type="button" size="sm" variant="outline" onClick={onRegenerate}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {tShipping('awb.regenerateAwb')}
            </Button>
          )}
          {onCancel && order.shipping_status !== 'cancelled' && order.shipping_status !== 'delivered' && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={onCancel}
              disabled={cancelling}
            >
              {tShipping('summary.cancelAwb')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="font-medium leading-snug break-words">{value}</p>
    </div>
  );
}

/** Prominent COD badge for order header (works before AWB too). */
export function CodOrderBanner({ order }: { order: ShippingOrder }) {
  const { t: tShipping } = useTranslation('shipping');
  if (!isCashOnDeliveryOrder(order)) return null;
  const amount = order.awb_cod_amount ?? order.total;
  const isLocker = order.delivery_type === 'locker';

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 space-y-1.5 animate-in fade-in-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-amber-600 hover:bg-amber-600 text-white border-0">
          {tShipping('summary.cod')}
        </Badge>
        {isLocker && <Badge variant="outline">{tShipping('summary.lockerPickup')}</Badge>}
        <span className="font-mono text-sm font-semibold">{formatRon(amount)}</span>
      </div>
      {isLocker && (
        <p className="text-sm text-muted-foreground truncate">
          {tShipping('summary.lockerLabel')}{' '}
          <span className="text-foreground font-medium">{order.locker_name || '—'}</span>
          {order.locker_address ? ` · ${order.locker_address}` : ''}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {tShipping('summary.codBannerFooter')}
      </p>
    </div>
  );
}
