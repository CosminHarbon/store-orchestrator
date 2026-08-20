import { useTranslation } from 'react-i18next';
import { AddressLocalityFields } from '@/components/address/AddressLocalityFields';
import { Checkbox } from '@/components/ui/checkbox';
import { CUSTOMER_NOTES_MAX } from '@/lib/delivery/rules';
import { formatRon } from '@/lib/storefront/api';
import { usesDeliveryAsBilling } from '@/lib/storefront/billing';
import type { CheckoutFormState, DeliveryQuote } from '@/lib/storefront/types';

export function CheckoutNotesField({
  value,
  onChange,
  className,
  labelClassName,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
}) {
  const { t } = useTranslation('checkout');
  return (
    <label className={className || 'block text-sm'}>
      <span className={labelClassName}>{t('field.orderNotes')}</span>
      <textarea
        value={value}
        maxLength={CUSTOMER_NOTES_MAX}
        rows={3}
        placeholder={t('placeholder.orderNotes')}
        onChange={(e) => onChange(e.target.value.slice(0, CUSTOMER_NOTES_MAX))}
        className={
          inputClassName ||
          'mt-1 w-full rounded-md border px-3 py-2.5 text-sm resize-y min-h-[84px]'
        }
      />
      <span className="block text-[11px] text-muted-foreground mt-1">
        {value.length}/{CUSTOMER_NOTES_MAX}
      </span>
    </label>
  );
}

export function deliveryQuoteSummary(
  quote: DeliveryQuote,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (quote.charge_mode === 'per_unit') {
    return t('delivery.quoteBreakdown', {
      price: formatRon(quote.price_per_unit || 0),
      qty: quote.quantity,
      total: formatRon(quote.delivery_fee || 0),
    });
  }
  return t('delivery.quoteTransport', {
    total: formatRon(quote.delivery_fee || 0),
  });
}

export function DeliveryQuoteDetails({
  quote,
  loading,
  customEnabled,
  deliveryType,
}: {
  quote: DeliveryQuote | null;
  loading?: boolean;
  customEnabled: boolean;
  deliveryType: 'home' | 'locker';
}) {
  const { t } = useTranslation('checkout');
  if (!customEnabled || deliveryType !== 'home') return null;
  if (loading) {
    return <p className="text-sm text-muted-foreground">{t('delivery.calculating')}</p>;
  }
  if (!quote) {
    return <p className="text-sm text-muted-foreground">{t('delivery.enterAddress')}</p>;
  }
  if (!quote.available) {
    return (
      <p className="text-sm text-red-600">
        {quote.error_message || t('delivery.unavailable')}
      </p>
    );
  }
  return (
    <div className="text-sm space-y-1">
      <p>
        {t('delivery.quoteArea', {
          county: quote.county,
          km: quote.distance_km,
        })}
      </p>
      <p>{deliveryQuoteSummary(quote, t)}</p>
    </div>
  );
}

export function CheckoutBillingFields({
  form,
  onChange,
  apiKey,
  className,
  inputClassName,
  labelClassName,
}: {
  form: CheckoutFormState;
  onChange: (next: CheckoutFormState) => void;
  apiKey: string;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
}) {
  const { t } = useTranslation('checkout');
  const sameAsDelivery = usesDeliveryAsBilling(form);
  const showFields = !sameAsDelivery;
  const inputCls =
    inputClassName ||
    'mt-1 w-full rounded-md border px-3 py-2.5 text-sm bg-background';

  const patch = (partial: Partial<CheckoutFormState>) => onChange({ ...form, ...partial });

  return (
    <div className={className || 'space-y-3'}>
      <div>
        <p className={labelClassName || 'text-sm font-medium'}>{t('billing.title')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {form.delivery_type === 'locker' ? t('billing.lockerHelp') : t('billing.help')}
        </p>
      </div>
      {form.delivery_type === 'home' && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={sameAsDelivery}
            onCheckedChange={(checked) => {
              const on = checked === true;
              if (on) {
                patch({ billing_same_as_delivery: true });
                return;
              }
              patch({
                billing_same_as_delivery: false,
                billing_county: form.billing_county || form.county,
                billing_city: form.billing_city || form.city,
                billing_street: form.billing_street || form.street,
                billing_street_number: form.billing_street_number || form.street_number,
                billing_block: form.billing_block || form.block,
                billing_apartment: form.billing_apartment || form.apartment,
              });
            }}
          />
          <span>{t('billing.sameAsDelivery')}</span>
        </label>
      )}
      {showFields && (
        <div className="space-y-3">
          <AddressLocalityFields
            apiKey={apiKey}
            county={form.billing_county}
            city={form.billing_city}
            labelClassName={labelClassName}
            onCountyChange={(county) => patch({ billing_county: county, billing_city: '' })}
            onLocalityChange={(loc) =>
              patch({
                billing_city: loc.name,
                billing_county: loc.county || form.billing_county,
              })
            }
          />
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 block text-sm">
              <span className={labelClassName}>{t('field.street')}</span>
              <input
                value={form.billing_street}
                onChange={(e) => patch({ billing_street: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block text-sm">
              <span className={labelClassName}>{t('field.numberShort')}</span>
              <input
                value={form.billing_street_number}
                onChange={(e) => patch({ billing_street_number: e.target.value })}
                className={inputCls}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className={labelClassName}>{t('field.block')}</span>
              <input
                value={form.billing_block}
                onChange={(e) => patch({ billing_block: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block text-sm">
              <span className={labelClassName}>{t('field.apartment')}</span>
              <input
                value={form.billing_apartment}
                onChange={(e) => patch({ billing_apartment: e.target.value })}
                className={inputCls}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
