import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CreditCard, Home, MapPin, Truck } from 'lucide-react';
import { LockerPicker } from '@/components/lockers/LockerPicker';
import { AddressLocalityFields } from '@/components/address/AddressLocalityFields';
import { formatRon } from '@/lib/storefront/api';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';

interface Props {
  commerce: StorefrontCommerce;
}

export function FloralCheckout({ commerce }: Props) {
  const { t } = useTranslation('checkout');
  const { t: tCommon } = useTranslation('common');
  const {
    checkoutForm,
    setCheckoutForm,
    checkoutStep,
    setCheckoutStep,
    paymentMethod,
    setPaymentMethod,
    fees,
    cart,
    cartSubtotal,
    deliveryFee,
    paymentFee,
    orderTotal,
    placeOrder,
    placingOrder,
    mapboxToken,
    apiKey,
    setView,
    setCartOpen,
  } = commerce;

  const [discountCode, setDiscountCode] = useState('');

  const steps = useMemo(
    () => [
      t('steps.customer'),
      t('steps.delivery'),
      t('steps.payment'),
      t('steps.review'),
    ],
    [t]
  );

  const canNext = () => {
    if (checkoutStep === 1) {
      return (
        !!checkoutForm.name.trim() &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutForm.email)
      );
    }
    if (checkoutStep === 2) {
      if (checkoutForm.delivery_type === 'home') {
        return !!(checkoutForm.county && checkoutForm.city && checkoutForm.street);
      }
      return !!(checkoutForm.locker_id && checkoutForm.selected_carrier_code);
    }
    return true;
  };

  const cashPaymentLabel =
    checkoutForm.delivery_type === 'locker'
      ? t('payment.cardAtLocker')
      : t('payment.cashOnDelivery');

  const reviewPaymentLabel =
    paymentMethod === 'card'
      ? t('payment.cardNetopia')
      : checkoutForm.delivery_type === 'locker'
        ? t('payment.cardAtLocker')
        : t('payment.cashOnDelivery');

  return (
    <div className="floral-container py-8 md:py-12">
      <button
        type="button"
        className="text-sm text-[var(--floral-muted)] mb-6 hover:text-[var(--floral-ink)]"
        onClick={() => {
          setView('home');
          setCartOpen(true);
        }}
      >
        {t('backToBag')}
      </button>

      <h1 className="text-4xl md:text-5xl floral-display mb-8">{t('title')}</h1>

      <div className="flex gap-2 mb-10 overflow-x-auto pb-1">
        {steps.map((label, i) => {
          const n = i + 1;
          const active = checkoutStep === n;
          const done = checkoutStep > n;
          return (
            <div
              key={label}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs whitespace-nowrap border ${
                active
                  ? 'bg-[var(--floral-ink)] text-white border-transparent'
                  : done
                    ? 'bg-[var(--floral-accent-soft)] border-transparent'
                    : 'border-[var(--floral-line)] text-[var(--floral-muted)]'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <span>{n}</span>}
              {label}
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-8">
        <div className="space-y-6">
          {checkoutStep === 1 && (
            <section className="bg-[var(--floral-surface)] rounded-[var(--floral-radius)] border border-[var(--floral-line)] p-5 space-y-4 floral-fade-up">
              <h2 className="text-2xl floral-display">{t('steps.customer')}</h2>
              <Field
                label={t('field.fullName')}
                value={checkoutForm.name}
                onChange={(v) => setCheckoutForm({ ...checkoutForm, name: v })}
              />
              <Field
                label={t('field.email')}
                type="email"
                value={checkoutForm.email}
                onChange={(v) => setCheckoutForm({ ...checkoutForm, email: v })}
              />
              <Field
                label={t('field.phone')}
                type="tel"
                value={checkoutForm.phone}
                onChange={(v) => setCheckoutForm({ ...checkoutForm, phone: v })}
              />
            </section>
          )}

          {checkoutStep === 2 && (
            <section className="bg-[var(--floral-surface)] rounded-[var(--floral-radius)] border border-[var(--floral-line)] p-5 space-y-4 floral-fade-up">
              <h2 className="text-2xl floral-display">{t('steps.delivery')}</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`rounded-[var(--floral-radius-sm)] border p-4 text-left ${
                    checkoutForm.delivery_type === 'home'
                      ? 'border-[var(--floral-ink)] bg-[var(--floral-accent-soft)]'
                      : 'border-[var(--floral-line)]'
                  }`}
                  onClick={() => setCheckoutForm({ ...checkoutForm, delivery_type: 'home' })}
                >
                  <Home className="h-5 w-5 mb-2" />
                  <div className="font-medium text-sm">{t('delivery.home')}</div>
                  <div className="text-xs text-[var(--floral-muted)] mt-1">{formatRon(fees.home_delivery_fee)}</div>
                </button>
                <button
                  type="button"
                  className={`rounded-[var(--floral-radius-sm)] border p-4 text-left ${
                    checkoutForm.delivery_type === 'locker'
                      ? 'border-[var(--floral-ink)] bg-[var(--floral-accent-soft)]'
                      : 'border-[var(--floral-line)]'
                  }`}
                  onClick={() => setCheckoutForm({ ...checkoutForm, delivery_type: 'locker' })}
                >
                  <MapPin className="h-5 w-5 mb-2" />
                  <div className="font-medium text-sm">{t('delivery.locker')}</div>
                  <div className="text-xs text-[var(--floral-muted)] mt-1">{formatRon(fees.locker_delivery_fee)}</div>
                </button>
              </div>

              {checkoutForm.delivery_type === 'home' ? (
                <div className="space-y-3">
                  <AddressLocalityFields
                    apiKey={apiKey}
                    county={checkoutForm.county}
                    city={checkoutForm.city}
                    labelClassName="text-[var(--floral-muted)] font-normal"
                    onCountyChange={(county) =>
                      setCheckoutForm({ ...checkoutForm, county, city: '' })
                    }
                    onLocalityChange={(loc) =>
                      setCheckoutForm({
                        ...checkoutForm,
                        city: loc.name,
                        county: loc.county || checkoutForm.county,
                      })
                    }
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Field
                        label={t('field.street')}
                        value={checkoutForm.street}
                        onChange={(v) => setCheckoutForm({ ...checkoutForm, street: v })}
                      />
                    </div>
                    <Field
                      label={t('field.numberShort')}
                      value={checkoutForm.street_number}
                      onChange={(v) => setCheckoutForm({ ...checkoutForm, street_number: v })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label={t('field.block')}
                      value={checkoutForm.block}
                      onChange={(v) => setCheckoutForm({ ...checkoutForm, block: v })}
                    />
                    <Field
                      label={t('field.apartment')}
                      value={checkoutForm.apartment}
                      onChange={(v) => setCheckoutForm({ ...checkoutForm, apartment: v })}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <LockerPicker
                    variant="premium"
                    apiKey={apiKey}
                    mapboxToken={mapboxToken || undefined}
                    carrierCode="sameday"
                    carrierName="Sameday"
                    value={{
                      locker_id: checkoutForm.locker_id,
                      locker_name: checkoutForm.locker_name,
                      locker_address: checkoutForm.locker_address,
                      city: checkoutForm.city,
                      county: checkoutForm.county,
                    }}
                    onSelect={(locker) => {
                      setCheckoutForm({
                        ...checkoutForm,
                        delivery_type: 'locker',
                        selected_carrier_code: locker.carrier_code || 'sameday',
                        locker_id: locker.fixed_location_id,
                        locker_name: locker.locker_name,
                        locker_address: locker.address,
                        city: locker.locality,
                        county: locker.county,
                        street: '',
                        street_number: '',
                        block: '',
                        apartment: '',
                      });
                    }}
                  />
                </div>
              )}

              <div className="flex items-start gap-2 text-sm text-[var(--floral-muted)] bg-[var(--floral-bg)] rounded-[var(--floral-radius-sm)] p-3">
                <Truck className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{t('delivery.eta')}</span>
              </div>
            </section>
          )}

          {checkoutStep === 3 && (
            <section className="bg-[var(--floral-surface)] rounded-[var(--floral-radius)] border border-[var(--floral-line)] p-5 space-y-4 floral-fade-up">
              <h2 className="text-2xl floral-display">{t('steps.payment')}</h2>
              {fees.card_enabled && (
                <button
                  type="button"
                  className={`w-full rounded-[var(--floral-radius-sm)] border p-4 text-left flex gap-3 ${
                    paymentMethod === 'card'
                      ? 'border-[var(--floral-ink)] bg-[var(--floral-accent-soft)]'
                      : 'border-[var(--floral-line)]'
                  }`}
                  onClick={() => setPaymentMethod('card')}
                >
                  <CreditCard className="h-5 w-5" />
                  <div>
                    <div className="font-medium text-sm">{t('payment.cardNetopia')}</div>
                    <div className="text-xs text-[var(--floral-muted)]">{t('payment.cardSecure')}</div>
                  </div>
                </button>
              )}
              {fees.cash_payment_enabled && (
                <button
                  type="button"
                  className={`w-full rounded-[var(--floral-radius-sm)] border p-4 text-left ${
                    paymentMethod === 'cash'
                      ? 'border-[var(--floral-ink)] bg-[var(--floral-accent-soft)]'
                      : 'border-[var(--floral-line)]'
                  }`}
                  onClick={() => setPaymentMethod('cash')}
                >
                  <div className="font-medium text-sm">{cashPaymentLabel}</div>
                  <div className="text-xs text-[var(--floral-muted)] mt-1">
                    {checkoutForm.delivery_type === 'locker'
                      ? fees.cash_payment_fee > 0
                        ? t('payment.payAtLockerFee', { fee: formatRon(fees.cash_payment_fee) })
                        : t('payment.payAtLocker')
                      : fees.cash_payment_fee > 0
                        ? t('payment.cashWithFee', { fee: formatRon(fees.cash_payment_fee) })
                        : t('payment.noExtraFee')}
                  </div>
                </button>
              )}
            </section>
          )}

          {checkoutStep === 4 && (
            <section className="bg-[var(--floral-surface)] rounded-[var(--floral-radius)] border border-[var(--floral-line)] p-5 space-y-3 floral-fade-up">
              <h2 className="text-2xl floral-display">{t('steps.review')}</h2>
              <p className="text-sm text-[var(--floral-muted)]">
                {checkoutForm.name} · {checkoutForm.email}
                {checkoutForm.phone ? ` · ${checkoutForm.phone}` : ''}
              </p>
              <p className="text-sm">
                {checkoutForm.delivery_type === 'home'
                  ? `${checkoutForm.street} ${checkoutForm.street_number}, ${checkoutForm.city}, ${checkoutForm.county}`
                  : checkoutForm.locker_address || checkoutForm.locker_name}
              </p>
              <p className="text-sm">
                {t('review.paymentPrefix')} {reviewPaymentLabel}
              </p>
            </section>
          )}

          <div className="flex gap-3">
            {checkoutStep > 1 && (
              <button
                type="button"
                className="floral-btn floral-btn-ghost"
                onClick={() => setCheckoutStep(checkoutStep - 1)}
              >
                {t('action.back')}
              </button>
            )}
            {checkoutStep < 4 ? (
              <button
                type="button"
                className="floral-btn floral-btn-primary"
                disabled={!canNext()}
                onClick={() => setCheckoutStep(checkoutStep + 1)}
              >
                {t('action.continue')}
              </button>
            ) : (
              <button
                type="button"
                className="floral-btn floral-btn-primary"
                disabled={placingOrder}
                onClick={() => void placeOrder()}
              >
                {placingOrder
                  ? t('action.placingOrder')
                  : t('action.payAmount', { amount: formatRon(orderTotal) })}
              </button>
            )}
          </div>
        </div>

        <aside className="bg-[var(--floral-surface)] rounded-[var(--floral-radius)] border border-[var(--floral-line)] p-5 h-fit sticky top-24 space-y-4">
          <h3 className="text-xl floral-display">{t('summary.title')}</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {cart.map((item) => (
              <div key={item.product.id} className="flex gap-3 text-sm">
                <div className="h-14 w-12 rounded-md overflow-hidden bg-[var(--floral-image-bg)] shrink-0">
                  {item.product.image && (
                    <img src={item.product.image} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="line-clamp-1">{item.product.title}</p>
                  <p className="text-[var(--floral-muted)]">{t('summary.qty', { count: item.quantity })}</p>
                </div>
                <span className="tabular-nums">{formatRon(item.product.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value)}
              placeholder={t('placeholder.discount')}
              className="flex-1 rounded-full border border-[var(--floral-line)] px-3 py-2 text-sm"
            />
            <button type="button" className="floral-btn floral-btn-ghost !py-2" disabled>
              {tCommon('apply')}
            </button>
          </div>
          <div className="space-y-2 text-sm border-t border-[var(--floral-line)] pt-3">
            <Row label={t('summary.subtotal')} value={formatRon(cartSubtotal)} />
            <Row label={t('summary.shipping')} value={formatRon(deliveryFee)} />
            {paymentFee > 0 && (
              <Row
                label={
                  checkoutForm.delivery_type === 'locker'
                    ? t('summary.lockerCardFee')
                    : t('summary.cashFee')
                }
                value={formatRon(paymentFee)}
              />
            )}
            <Row label={t('summary.total')} value={formatRon(orderTotal)} bold />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--floral-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-[var(--floral-radius-sm)] border border-[var(--floral-line)] bg-white px-3 py-2.5"
      />
    </label>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold text-base pt-1' : ''}`}>
      <span className={bold ? '' : 'text-[var(--floral-muted)]'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
