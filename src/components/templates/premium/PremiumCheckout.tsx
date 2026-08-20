import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CreditCard, Home, MapPin, Truck } from 'lucide-react';
import { LockerPicker } from '@/components/lockers/LockerPicker';
import { AddressLocalityFields } from '@/components/address/AddressLocalityFields';
import { CheckoutNotesField, CheckoutBillingFields, DeliveryQuoteDetails, deliveryQuoteSummary } from '@/components/storefront/CheckoutExtras';
import { formatRon } from '@/lib/storefront/api';
import { isBillingComplete, resolvedBilling } from '@/lib/storefront/billing';
import type { StorefrontCommerce } from '@/hooks/useStorefrontCommerce';

interface Props {
  commerce: StorefrontCommerce;
}

export function PremiumCheckout({ commerce }: Props) {
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
    allowOrderNotes,
    deliveryConfig,
    deliveryQuote,
    deliveryQuoteLoading,
    customHomePricing,
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
        if (!(checkoutForm.county && checkoutForm.city && checkoutForm.street)) return false;
        if (customHomePricing && (deliveryQuoteLoading || !deliveryQuote?.available)) return false;
        return isBillingComplete(checkoutForm);
      }
      return !!(checkoutForm.locker_id && checkoutForm.selected_carrier_code) && isBillingComplete(checkoutForm);
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
    <div className="prem-container py-8 md:py-12">
      <button
        type="button"
        className="text-sm text-[var(--prem-muted)] mb-6 hover:text-[var(--prem-ink)]"
        onClick={() => {
          setView('home');
          setCartOpen(true);
        }}
      >
        {t('backToBag')}
      </button>

      <h1 className="text-4xl md:text-5xl prem-display mb-8">{t('title')}</h1>

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
                  ? 'bg-[var(--prem-ink)] text-white border-transparent'
                  : done
                    ? 'bg-[var(--prem-accent-soft)] border-transparent'
                    : 'border-[var(--prem-line)] text-[var(--prem-muted)]'
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
            <section className="bg-[var(--prem-surface)] rounded-[var(--prem-radius)] border border-[var(--prem-line)] p-5 space-y-4 prem-fade-up">
              <h2 className="text-2xl prem-display">{t('steps.customer')}</h2>
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
            <section className="bg-[var(--prem-surface)] rounded-[var(--prem-radius)] border border-[var(--prem-line)] p-5 space-y-4 prem-fade-up">
              <h2 className="text-2xl prem-display">{t('steps.delivery')}</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`rounded-[var(--prem-radius-sm)] border p-4 text-left ${
                    checkoutForm.delivery_type === 'home'
                      ? 'border-[var(--prem-ink)] bg-[var(--prem-accent-soft)]'
                      : 'border-[var(--prem-line)]'
                  }`}
                  onClick={() => setCheckoutForm({ ...checkoutForm, delivery_type: 'home' })}
                >
                  <Home className="h-5 w-5 mb-2" />
                  <div className="font-medium text-sm">{t('delivery.home')}</div>
                  <div className="text-xs text-[var(--prem-muted)] mt-1">
                    {customHomePricing
                      ? t('delivery.calculatedByDistance')
                      : formatRon(fees.home_delivery_fee)}
                  </div>
                </button>
                {deliveryConfig.locker_enabled !== false && (
                <button
                  type="button"
                  className={`rounded-[var(--prem-radius-sm)] border p-4 text-left ${
                    checkoutForm.delivery_type === 'locker'
                      ? 'border-[var(--prem-ink)] bg-[var(--prem-accent-soft)]'
                      : 'border-[var(--prem-line)]'
                  }`}
                  onClick={() => setCheckoutForm({ ...checkoutForm, delivery_type: 'locker' })}
                >
                  <MapPin className="h-5 w-5 mb-2" />
                  <div className="font-medium text-sm">{t('delivery.locker')}</div>
                  <div className="text-xs text-[var(--prem-muted)] mt-1">{formatRon(fees.locker_delivery_fee)}</div>
                </button>
                )}
              </div>

              {checkoutForm.delivery_type === 'home' ? (
                <div className="space-y-3">
                  <AddressLocalityFields
                    apiKey={apiKey}
                    county={checkoutForm.county}
                    city={checkoutForm.city}
                    labelClassName="text-[var(--prem-muted)] font-normal"
                    allowedCounties={
                      deliveryConfig.custom_pricing_enabled &&
                      deliveryConfig.coverage_mode === 'counties'
                        ? deliveryConfig.covered_counties
                        : deliveryConfig.custom_pricing_enabled &&
                            deliveryConfig.coverage_mode === 'localities'
                          ? deliveryConfig.covered_localities.map((item) => item.county)
                          : undefined
                    }
                    allowedLocalities={
                      deliveryConfig.custom_pricing_enabled &&
                      deliveryConfig.coverage_mode === 'localities'
                        ? deliveryConfig.covered_localities
                        : undefined
                    }
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
                  <DeliveryQuoteDetails
                    quote={deliveryQuote}
                    loading={deliveryQuoteLoading}
                    customEnabled={deliveryConfig.custom_pricing_enabled}
                    deliveryType={checkoutForm.delivery_type}
                  />
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

              <CheckoutBillingFields
                form={checkoutForm}
                onChange={setCheckoutForm}
                apiKey={apiKey}
                labelClassName="text-[var(--prem-muted)] font-normal"
                inputClassName="mt-1 w-full rounded-[var(--prem-radius-sm)] border border-[var(--prem-line)] bg-white px-3 py-2.5 text-sm"
              />

              <div className="flex items-start gap-2 text-sm text-[var(--prem-muted)] bg-[var(--prem-bg)] rounded-[var(--prem-radius-sm)] p-3">
                <Truck className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{t('delivery.eta')}</span>
              </div>
            </section>
          )}

          {checkoutStep === 3 && (
            <section className="bg-[var(--prem-surface)] rounded-[var(--prem-radius)] border border-[var(--prem-line)] p-5 space-y-4 prem-fade-up">
              <h2 className="text-2xl prem-display">{t('steps.payment')}</h2>
              {fees.card_enabled && (
                <button
                  type="button"
                  className={`w-full rounded-[var(--prem-radius-sm)] border p-4 text-left flex gap-3 ${
                    paymentMethod === 'card'
                      ? 'border-[var(--prem-ink)] bg-[var(--prem-accent-soft)]'
                      : 'border-[var(--prem-line)]'
                  }`}
                  onClick={() => setPaymentMethod('card')}
                >
                  <CreditCard className="h-5 w-5" />
                  <div>
                    <div className="font-medium text-sm">{t('payment.cardNetopia')}</div>
                    <div className="text-xs text-[var(--prem-muted)]">{t('payment.cardSecure')}</div>
                  </div>
                </button>
              )}
              {fees.cash_payment_enabled && (
                <button
                  type="button"
                  className={`w-full rounded-[var(--prem-radius-sm)] border p-4 text-left ${
                    paymentMethod === 'cash'
                      ? 'border-[var(--prem-ink)] bg-[var(--prem-accent-soft)]'
                      : 'border-[var(--prem-line)]'
                  }`}
                  onClick={() => setPaymentMethod('cash')}
                >
                  <div className="font-medium text-sm">{cashPaymentLabel}</div>
                  <div className="text-xs text-[var(--prem-muted)] mt-1">
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
            <section className="bg-[var(--prem-surface)] rounded-[var(--prem-radius)] border border-[var(--prem-line)] p-5 space-y-3 prem-fade-up">
              <h2 className="text-2xl prem-display">{t('steps.review')}</h2>
              <p className="text-sm text-[var(--prem-muted)]">
                {checkoutForm.name} · {checkoutForm.email}
                {checkoutForm.phone ? ` · ${checkoutForm.phone}` : ''}
              </p>
              <p className="text-sm">
                {checkoutForm.delivery_type === 'home'
                  ? `${checkoutForm.street} ${checkoutForm.street_number}, ${checkoutForm.city}, ${checkoutForm.county}`
                  : checkoutForm.locker_address || checkoutForm.locker_name}
              </p>
              <p className="text-sm">
                {t('review.billingPrefix')}{' '}
                {resolvedBilling(checkoutForm).billing_address}
              </p>
              <p className="text-sm">
                {t('review.paymentPrefix')} {reviewPaymentLabel}
              </p>
              {allowOrderNotes && (
                <CheckoutNotesField
                  value={checkoutForm.notes}
                  onChange={(notes) => setCheckoutForm({ ...checkoutForm, notes })}
                  labelClassName="text-[var(--prem-muted)]"
                  inputClassName="mt-1 w-full rounded-[var(--prem-radius-sm)] border border-[var(--prem-line)] bg-white px-3 py-2.5 text-sm"
                />
              )}
            </section>
          )}

          <div className="flex gap-3">
            {checkoutStep > 1 && (
              <button
                type="button"
                className="prem-btn prem-btn-ghost"
                onClick={() => setCheckoutStep(checkoutStep - 1)}
              >
                {t('action.back')}
              </button>
            )}
            {checkoutStep < 4 ? (
              <button
                type="button"
                className="prem-btn prem-btn-primary"
                disabled={!canNext()}
                onClick={() => setCheckoutStep(checkoutStep + 1)}
              >
                {t('action.continue')}
              </button>
            ) : (
              <button
                type="button"
                className="prem-btn prem-btn-primary"
                disabled={
                  placingOrder ||
                  (customHomePricing && (deliveryQuoteLoading || !deliveryQuote?.available))
                }
                onClick={() => void placeOrder()}
              >
                {placingOrder
                  ? t('action.placingOrder')
                  : t('action.payAmount', { amount: formatRon(orderTotal) })}
              </button>
            )}
          </div>
        </div>

        <aside className="bg-[var(--prem-surface)] rounded-[var(--prem-radius)] border border-[var(--prem-line)] p-5 h-fit sticky top-24 space-y-4">
          <h3 className="text-xl prem-display">{t('summary.title')}</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {cart.map((item) => (
              <div key={item.product.id} className="flex gap-3 text-sm">
                <div className="h-14 w-12 rounded-md overflow-hidden bg-[var(--prem-image-bg)] shrink-0">
                  {item.product.image && (
                    <img src={item.product.image} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="line-clamp-1">{item.product.title}</p>
                  <p className="text-[var(--prem-muted)]">{t('summary.qty', { count: item.quantity })}</p>
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
              className="flex-1 rounded-full border border-[var(--prem-line)] px-3 py-2 text-sm"
            />
            <button type="button" className="prem-btn prem-btn-ghost !py-2" disabled>
              {tCommon('apply')}
            </button>
          </div>
          <div className="space-y-2 text-sm border-t border-[var(--prem-line)] pt-3">
            <Row label={t('summary.subtotal')} value={formatRon(cartSubtotal)} />
            <Row label={t('summary.shipping')} value={formatRon(deliveryFee)} />
            {customHomePricing && deliveryQuote?.available && (
              <p className="text-xs text-[var(--prem-muted)]">
                {deliveryQuoteSummary(deliveryQuote, t)}
              </p>
            )}
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
      <span className="text-[var(--prem-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-[var(--prem-radius-sm)] border border-[var(--prem-line)] bg-white px-3 py-2.5"
      />
    </label>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold text-base pt-1' : ''}`}>
      <span className={bold ? '' : 'text-[var(--prem-muted)]'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
