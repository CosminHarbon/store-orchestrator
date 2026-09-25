/**
 * Hosted SpeedVendors checkout (Option B1).
 * Route: /checkout?draft=<opaque-token>
 *
 * Reuses the same address, locker, delivery-quote, billing, and /orders
 * Netopia paths as PremiumCheckout / EnhancedElementarTemplate.
 * Line prices come from the signed checkout-draft; delivery/payment fees
 * come from store-api /config (+ live /delivery-quote when enabled).
 */

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CreditCard, Home, MapPin, Truck } from 'lucide-react';
import { AddressLocalityFields } from '@/components/address/AddressLocalityFields';
import { LockerPicker } from '@/components/lockers/LockerPicker';
import {
  CheckoutBillingFields,
  CheckoutNotesField,
  DeliveryMessageNote,
  DeliveryQuoteDetails,
  deliveryOptionPriceLabel,
  deliveryQuoteSummary,
} from '@/components/storefront/CheckoutExtras';
import { StorefrontThemeProvider } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import {
  CHECKOUT_APP_ORIGIN,
  STORE_API_BASE,
  fetchCheckoutDraft,
  fetchDeliveryQuote,
  fetchStoreConfig,
  formatRon,
  storeApiHeaders,
  type CheckoutDraftView,
} from '@/lib/storefront/api';
import { isBillingComplete, resolvedBilling } from '@/lib/storefront/billing';
import { emptyCheckoutForm, type CheckoutFormState, type DeliveryQuote, type StorefrontDeliveryConfig, type StorefrontFeeSettings } from '@/lib/storefront/types';
import { cn } from '@/lib/utils';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; code?: string }
  | {
      status: 'ready';
      draft: CheckoutDraftView;
      fees: StorefrontFeeSettings;
      deliveryConfig: StorefrontDeliveryConfig;
      mapboxToken: string;
      allowOrderNotes: boolean;
    }
  | {
      status: 'success';
      orderId: string;
      total: number;
      returnUrl: string;
      storeName: string;
      paymentMethod: 'cash' | 'card';
    };

type PaymentMethod = 'cash' | 'card';

function returnStoreUrl(draft: Pick<CheckoutDraftView, 'return_origin' | 'return_path'>): string {
  try {
    const u = new URL(draft.return_path || '/', draft.return_origin);
    if (u.origin !== new URL(draft.return_origin).origin) return draft.return_origin;
    return u.toString();
  } catch {
    return draft.return_origin;
  }
}

function feesFromDraft(draft: CheckoutDraftView): StorefrontFeeSettings {
  return {
    cash_payment_enabled: draft.cash_payment_enabled && draft.supported.cash !== false,
    cash_payment_fee: draft.cash_payment_fee,
    home_delivery_fee: draft.home_delivery_fee,
    locker_delivery_fee: Number(draft.locker_delivery_fee || 0),
    card_enabled: !!draft.supported.card,
  };
}

function HostedCheckoutInner() {
  const [params] = useSearchParams();
  const draftToken = params.get('draft') || '';
  /** UI-only fixture for design inspection without a signed draft. No live order. */
  const uiPreview = params.get('ui') === 'preview';

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [form, setForm] = useState<CheckoutFormState>(() => ({
    ...emptyCheckoutForm(),
    delivery_type: 'home',
    billing_same_as_delivery: true,
  }));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [placing, setPlacing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmLiveOrder, setConfirmLiveOrder] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);

  const reloadDraft = useCallback(async () => {
    if (uiPreview && !draftToken) {
      const draft: CheckoutDraftView = {
        store_name: 'Preview Boutique',
        store_api_key: 'preview',
        preferred_language: 'ro',
        currency: 'RON',
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        return_origin: CHECKOUT_APP_ORIGIN,
        return_path: '/',
        items: [
          {
            product_id: '00000000-0000-4000-8000-000000000001',
            variant_id: null,
            title: 'Sample product',
            quantity: 1,
            unit_price: 129,
            line_total: 129,
            image_url: null,
            stock: 10,
          },
        ],
        subtotal: 129,
        home_delivery_fee: 19,
        locker_delivery_fee: 12,
        cash_payment_fee: 5,
        cash_payment_enabled: true,
        estimated_total: 153,
        supported: { home_delivery: true, cash: true, card: true, locker: true },
      };
      setLoad({
        status: 'ready',
        draft,
        fees: feesFromDraft(draft),
        deliveryConfig: {
          custom_pricing_enabled: false,
          locker_enabled: true,
          provider: 'eawb',
          free_delivery: false,
          message: 'UI preview only — locker map and live quotes need a real draft + store API key.',
          coverage_mode: 'romania',
          covered_counties: [],
          covered_localities: [],
        },
        mapboxToken: '',
        allowOrderNotes: true,
      });
      setPaymentMethod('cash');
      return;
    }

    if (!draftToken) {
      setLoad({ status: 'error', message: 'Missing checkout draft token.', code: 'DRAFT_TOKEN_REQUIRED' });
      return;
    }
    setLoad({ status: 'loading' });
    try {
      const draft = await fetchCheckoutDraft(draftToken);
      let fees = feesFromDraft(draft);
      let deliveryConfig: StorefrontDeliveryConfig = {
        custom_pricing_enabled: false,
        locker_enabled: draft.supported.locker !== false,
        provider: null,
        free_delivery: false,
        message: null,
        coverage_mode: 'romania',
        covered_counties: [],
        covered_localities: [],
      };
      let mapboxToken = '';
      let allowOrderNotes = true;
      try {
        const cfg = await fetchStoreConfig(draft.store_api_key);
        fees = cfg.fees;
        deliveryConfig = cfg.deliveryConfig;
        mapboxToken = cfg.mapboxToken;
        allowOrderNotes = cfg.allowOrderNotes;
      } catch (cfgErr) {
        console.warn('HostedCheckout: falling back to draft fees; /config failed', cfgErr);
      }
      setLoad({ status: 'ready', draft, fees, deliveryConfig, mapboxToken, allowOrderNotes });
      if (fees.card_enabled && !fees.cash_payment_enabled) setPaymentMethod('card');
      else if (fees.cash_payment_enabled) setPaymentMethod('cash');
      else if (fees.card_enabled) setPaymentMethod('card');
    } catch (e) {
      const err = e as Error & { code?: string; status?: number };
      setLoad({
        status: 'error',
        message: err.message || 'Unable to load checkout',
        code: err.code,
      });
    }
  }, [draftToken, uiPreview]);

  useEffect(() => {
    void reloadDraft();
  }, [reloadDraft]);

  const customHomePricing =
    load.status === 'ready' &&
    load.deliveryConfig.custom_pricing_enabled &&
    form.delivery_type === 'home' &&
    !load.deliveryConfig.free_delivery;

  useEffect(() => {
    if (load.status !== 'ready' || uiPreview) {
      setDeliveryQuote(null);
      setDeliveryQuoteLoading(false);
      return;
    }
    if (
      load.deliveryConfig.free_delivery ||
      !load.deliveryConfig.custom_pricing_enabled ||
      form.delivery_type !== 'home'
    ) {
      setDeliveryQuote(null);
      setDeliveryQuoteLoading(false);
      return;
    }
    const ready =
      !!form.county && !!form.city && !!form.street && !!form.street_number && load.draft.items.length > 0;
    if (!ready) {
      setDeliveryQuote(null);
      return;
    }
    let cancelled = false;
    setDeliveryQuoteLoading(true);
    const timer = window.setTimeout(() => {
      void fetchDeliveryQuote(load.draft.store_api_key, {
        county: form.county,
        city: form.city,
        street: form.street,
        street_number: form.street_number,
        items: load.draft.items.map((item) => ({ quantity: item.quantity, price: item.unit_price })),
        subtotal: load.draft.subtotal,
      })
        .then((quote) => {
          if (!cancelled) setDeliveryQuote(quote);
        })
        .catch(() => {
          if (!cancelled) {
            setDeliveryQuote({ enabled: true, available: false, error: 'DISTANCE_UNAVAILABLE' });
          }
        })
        .finally(() => {
          if (!cancelled) setDeliveryQuoteLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    form.city,
    form.county,
    form.delivery_type,
    form.street,
    form.street_number,
    load,
    uiPreview,
  ]);

  const totals = useMemo(() => {
    if (load.status !== 'ready') return null;
    const { draft, fees, deliveryConfig } = load;
    const delivery = deliveryConfig.free_delivery
      ? 0
      : customHomePricing
        ? deliveryQuote?.available
          ? Number(deliveryQuote.delivery_fee || 0)
          : 0
        : form.delivery_type === 'home'
          ? fees.home_delivery_fee
          : fees.locker_delivery_fee;
    const cash =
      paymentMethod === 'cash' && fees.cash_payment_enabled ? fees.cash_payment_fee : 0;
    return {
      subtotal: draft.subtotal,
      delivery,
      cash,
      total: draft.subtotal + delivery + cash,
    };
  }, [customHomePricing, deliveryQuote, form.delivery_type, load, paymentMethod]);

  const lockerEnabled =
    load.status === 'ready' &&
    load.deliveryConfig.locker_enabled !== false &&
    load.draft.supported.locker !== false;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (load.status !== 'ready') return;
    const { draft, fees, deliveryConfig } = load;
    setSubmitError(null);

    if (uiPreview) {
      setSubmitError(
        'UI preview mode cannot place orders. Open a real /checkout?draft=… link from a storefront.',
      );
      return;
    }

    if (!confirmLiveOrder) {
      setSubmitError('Tick the confirmation box to place a live order against the store API.');
      return;
    }

    if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setSubmitError('Please enter a valid name and email.');
      return;
    }
    if (!form.phone.trim()) {
      setSubmitError('Please enter your phone number.');
      return;
    }

    if (form.delivery_type === 'home') {
      if (!(form.county && form.city && form.street && form.street_number)) {
        setSubmitError('Please complete your delivery address (street, number, city, county).');
        return;
      }
      if (customHomePricing && (deliveryQuoteLoading || !deliveryQuote?.available)) {
        setSubmitError(deliveryQuote?.error_message || 'Delivery is not available for this address.');
        return;
      }
    } else {
      if (!form.locker_id || !form.selected_carrier_code) {
        setSubmitError('Please select a locker.');
        return;
      }
    }

    if (!isBillingComplete(form)) {
      setSubmitError('Please complete billing address details.');
      return;
    }

    const method: PaymentMethod =
      fees.card_enabled && paymentMethod === 'card'
        ? 'card'
        : fees.cash_payment_enabled
          ? 'cash'
          : fees.card_enabled
            ? 'card'
            : 'cash';

    if (method === 'cash' && !fees.cash_payment_enabled) {
      setSubmitError('Cash on delivery is not enabled for this store.');
      return;
    }
    if (method === 'card' && !fees.card_enabled) {
      setSubmitError('Card payment is not configured for this store (Netopia).');
      return;
    }

    setPlacing(true);
    try {
      const billing = resolvedBilling(form);
      const payload = {
        customer_name: form.name.trim(),
        customer_email: form.email.trim(),
        customer_phone: form.phone.trim(),
        customer_notes: form.notes?.trim() || null,
        customer_street: form.street.trim(),
        customer_street_number: form.street_number.trim(),
        customer_city: form.city.trim(),
        customer_county: form.county.trim(),
        customer_block: form.block?.trim() || null,
        customer_apartment: form.apartment?.trim() || null,
        customer_address:
          form.delivery_type === 'home'
            ? [
                form.street,
                form.street_number,
                form.block ? `Block ${form.block}` : '',
                form.apartment ? `Apt ${form.apartment}` : '',
                form.city,
                form.county,
              ]
                .filter(Boolean)
                .join(', ')
            : [form.locker_name, form.locker_address, form.city, form.county].filter(Boolean).join(', '),
        delivery_type: form.delivery_type,
        selected_carrier_code: form.selected_carrier_code || null,
        locker_id: form.locker_id || null,
        locker_name: form.locker_name || null,
        locker_address: form.locker_address || null,
        payment_method: method,
        billing_same_as_delivery: billing.billing_same_as_delivery,
        billing_city: billing.billing_city,
        billing_county: billing.billing_county,
        billing_street: billing.billing_street,
        billing_street_number: billing.billing_street_number,
        billing_block: billing.billing_block,
        billing_apartment: billing.billing_apartment,
        // Client total is advisory; store-api recomputes authoritatively.
        total: totals?.total,
        items: draft.items.map((line) => ({
          product_id: line.product_id,
          variant_id: line.variant_id,
          quantity: line.quantity,
        })),
      };

      const res = await fetch(`${STORE_API_BASE}/orders`, {
        method: 'POST',
        headers: { ...storeApiHeaders(draft.store_api_key), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(String(data.error || data.message || 'Order failed'));
        if (
          data.code === 'INSUFFICIENT_STOCK' ||
          data.code === 'INVALID_PRODUCT' ||
          data.code === 'INVALID_VARIANT'
        ) {
          void reloadDraft();
        }
        return;
      }

      if (data.payment_url && method === 'card') {
        // Genuine Netopia redirect — same as template checkout.
        window.location.href = String(data.payment_url);
        return;
      }

      const orderId = String(data.order?.id || data.order_id || data.id || '');
      const total = Number(data.order?.total ?? totals?.total ?? draft.estimated_total);
      setLoad({
        status: 'success',
        orderId,
        total,
        returnUrl: returnStoreUrl(draft),
        storeName: draft.store_name,
        paymentMethod: method,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setPlacing(false);
    }
  }

  if (load.status === 'loading') {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-8">
        <p className="text-muted-foreground">Loading secure checkout…</p>
      </div>
    );
  }

  if (load.status === 'error') {
    const expired = load.code === 'DRAFT_EXPIRED';
    const tampered =
      load.code === 'DRAFT_TOKEN_TAMPERED' ||
      load.code === 'DRAFT_TOKEN_INVALID' ||
      load.code === 'DRAFT_TOKEN_REQUIRED';
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">
          {expired ? 'Checkout expired' : tampered ? 'Invalid checkout link' : 'Checkout unavailable'}
        </h1>
        <p className="text-muted-foreground">{load.message}</p>
        {load.code && <p className="text-xs text-muted-foreground">Code: {load.code}</p>}
        <p className="text-sm text-muted-foreground">
          Return to the storefront and open checkout again to create a fresh secure draft.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="underline" to="/">
            SpeedVendors home
          </Link>
          <Link className="underline" to="/checkout?ui=preview">
            Open UI preview
          </Link>
        </div>
      </div>
    );
  }

  if (load.status === 'success') {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">
          {load.paymentMethod === 'card' ? 'Payment started' : 'Order confirmed'}
        </h1>
        <p>
          Thanks for your order at <strong>{load.storeName}</strong>.
        </p>
        {load.orderId && (
          <p>
            Order ID: <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{load.orderId}</code>
          </p>
        )}
        <p>
          {load.paymentMethod === 'cash' ? 'Total due on delivery: ' : 'Order total: '}
          <strong>{formatRon(load.total)}</strong>
        </p>
        <a
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          href={load.returnUrl}
        >
          Return to store
        </a>
      </div>
    );
  }

  const { draft, fees, deliveryConfig, mapboxToken, allowOrderNotes } = load;
  const usingProxy = STORE_API_BASE.includes('127.0.0.1') || STORE_API_BASE.includes('localhost');

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-6 md:py-10">
      <header className="mb-6 border-b pb-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">SpeedVendors checkout</p>
        <h1 className="text-2xl font-semibold md:text-3xl">{draft.store_name}</h1>
        <p className="text-sm text-muted-foreground">
          Secure hosted checkout · Home & locker · COD{fees.card_enabled ? ' & Netopia card' : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          Draft expires {new Date(draft.expires_at).toLocaleString()}
          {uiPreview ? ' · UI preview (no live order)' : ''}
          {usingProxy ? ' · local store-api proxy' : ''}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <form className="space-y-6" onSubmit={onSubmit}>
          <section className="space-y-3 rounded-xl border bg-card p-4 md:p-5">
            <h2 className="text-lg font-medium">Customer</h2>
            <Field
              label="Full name *"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              autoComplete="name"
              required
            />
            <Field
              label="Email *"
              type="email"
              value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
              autoComplete="email"
              required
            />
            <Field
              label="Phone *"
              type="tel"
              value={form.phone}
              onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
              autoComplete="tel"
              required
            />
          </section>

          <section className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
            <h2 className="text-lg font-medium">Delivery</h2>
            <DeliveryMessageNote message={deliveryConfig.message} className="text-sm text-muted-foreground" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                className={cn(
                  'rounded-xl border p-4 text-left transition',
                  form.delivery_type === 'home' ? 'border-primary bg-primary/5' : 'border-border',
                )}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    delivery_type: 'home',
                    locker_id: '',
                    locker_name: '',
                    locker_address: '',
                    selected_carrier_code: '',
                  }))
                }
              >
                <Home className="mb-2 h-5 w-5" />
                <div className="text-sm font-medium">Home delivery</div>
                {!deliveryConfig.free_delivery && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {deliveryOptionPriceLabel({
                      free: false,
                      customPricing: deliveryConfig.custom_pricing_enabled,
                      fee: fees.home_delivery_fee,
                      formatFee: formatRon,
                      calculatedLabel: 'Calculated by distance',
                    })}
                  </div>
                )}
              </button>
              {lockerEnabled && (
                <button
                  type="button"
                  className={cn(
                    'rounded-xl border p-4 text-left transition',
                    form.delivery_type === 'locker' ? 'border-primary bg-primary/5' : 'border-border',
                  )}
                  onClick={() => setForm((f) => ({ ...f, delivery_type: 'locker' }))}
                >
                  <MapPin className="mb-2 h-5 w-5" />
                  <div className="text-sm font-medium">Locker delivery</div>
                  {!deliveryConfig.free_delivery && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {deliveryOptionPriceLabel({
                        free: false,
                        fee: fees.locker_delivery_fee,
                        formatFee: formatRon,
                        calculatedLabel: 'Calculated by distance',
                      })}
                    </div>
                  )}
                </button>
              )}
            </div>

            {form.delivery_type === 'home' ? (
              <div className="space-y-3">
                <AddressLocalityFields
                  apiKey={uiPreview ? '' : draft.store_api_key}
                  county={form.county}
                  city={form.city}
                  manualEntry={deliveryConfig.provider === 'manual' || uiPreview}
                  allowedCounties={
                    deliveryConfig.custom_pricing_enabled && deliveryConfig.coverage_mode === 'counties'
                      ? deliveryConfig.covered_counties
                      : deliveryConfig.custom_pricing_enabled &&
                          deliveryConfig.coverage_mode === 'localities'
                        ? deliveryConfig.covered_localities.map((item) => item.county)
                        : undefined
                  }
                  allowedLocalities={
                    deliveryConfig.custom_pricing_enabled && deliveryConfig.coverage_mode === 'localities'
                      ? deliveryConfig.covered_localities
                      : undefined
                  }
                  onCountyChange={(county) => setForm((f) => ({ ...f, county, city: '' }))}
                  onLocalityChange={(loc) =>
                    setForm((f) => ({
                      ...f,
                      city: loc.name,
                      county: loc.county || f.county,
                    }))
                  }
                />
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Field
                      label="Street *"
                      value={form.street}
                      onChange={(v) => setForm((f) => ({ ...f, street: v }))}
                      required={form.delivery_type === 'home'}
                    />
                  </div>
                  <Field
                    label="No. *"
                    value={form.street_number}
                    onChange={(v) => setForm((f) => ({ ...f, street_number: v }))}
                    required={form.delivery_type === 'home'}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Block" value={form.block} onChange={(v) => setForm((f) => ({ ...f, block: v }))} />
                  <Field
                    label="Apartment"
                    value={form.apartment}
                    onChange={(v) => setForm((f) => ({ ...f, apartment: v }))}
                  />
                </div>
                <DeliveryQuoteDetails
                  quote={deliveryQuote}
                  loading={deliveryQuoteLoading}
                  customEnabled={deliveryConfig.custom_pricing_enabled}
                  deliveryType={form.delivery_type}
                />
              </div>
            ) : uiPreview ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Locker picker is the same <code>LockerPicker</code> used by templates. In UI preview it is
                inactive — mint a real draft with a merchant API key to search Sameday lockers on the map.
              </div>
            ) : (
              <LockerPicker
                apiKey={draft.store_api_key}
                mapboxToken={mapboxToken || undefined}
                carrierCode="sameday"
                carrierName="Sameday"
                value={{
                  locker_id: form.locker_id,
                  locker_name: form.locker_name,
                  locker_address: form.locker_address,
                  city: form.city,
                  county: form.county,
                }}
                onSelect={(locker) => {
                  setForm((f) => ({
                    ...f,
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
                  }));
                }}
              />
            )}

            <CheckoutBillingFields
              form={form}
              onChange={setForm}
              apiKey={uiPreview ? '' : draft.store_api_key}
              manualEntry={deliveryConfig.provider === 'manual' || uiPreview}
            />

            <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              <Truck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Delivery times follow the merchant’s carrier settings (same as /templates checkout).</span>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border bg-card p-4 md:p-5">
            <h2 className="text-lg font-medium">Payment</h2>
            {fees.card_enabled && (
              <button
                type="button"
                className={cn(
                  'flex w-full gap-3 rounded-xl border p-4 text-left',
                  paymentMethod === 'card' ? 'border-primary bg-primary/5' : 'border-border',
                )}
                onClick={() => setPaymentMethod('card')}
              >
                <CreditCard className="h-5 w-5" />
                <div>
                  <div className="text-sm font-medium">Card — Netopia</div>
                  <div className="text-xs text-muted-foreground">
                    Redirects to the merchant’s Netopia checkout (same /orders → payment_url path as templates).
                  </div>
                </div>
              </button>
            )}
            {fees.cash_payment_enabled && (
              <button
                type="button"
                className={cn(
                  'w-full rounded-xl border p-4 text-left',
                  paymentMethod === 'cash' ? 'border-primary bg-primary/5' : 'border-border',
                )}
                onClick={() => setPaymentMethod('cash')}
              >
                <div className="text-sm font-medium">
                  {form.delivery_type === 'locker' ? 'Pay at locker' : 'Cash on delivery'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {fees.cash_payment_fee > 0
                    ? `Includes ${formatRon(fees.cash_payment_fee)} cash fee (server-authoritative).`
                    : 'No extra cash fee.'}
                </div>
              </button>
            )}
            {!fees.card_enabled && !fees.cash_payment_enabled && (
              <p className="text-sm text-destructive">No payment methods are enabled for this store.</p>
            )}
          </section>

          {allowOrderNotes && (
            <section className="rounded-xl border bg-card p-4 md:p-5">
              <CheckoutNotesField
                value={form.notes}
                onChange={(notes) => setForm((f) => ({ ...f, notes }))}
              />
            </section>
          )}

          {!uiPreview && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmLiveOrder}
                onChange={(e) => setConfirmLiveOrder(e.target.checked)}
              />
              <span>
                I understand this places a <strong>live</strong> order via store-api
                {paymentMethod === 'card' ? ' and may redirect to Netopia' : ''}. Automated tests must not
                tick this.
              </span>
            </label>
          )}

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <Button
            type="submit"
            className="h-11 w-full"
            disabled={
              placing ||
              (customHomePricing && (deliveryQuoteLoading || !deliveryQuote?.available)) ||
              (!uiPreview && !confirmLiveOrder)
            }
          >
            {placing
              ? 'Placing order…'
              : uiPreview
                ? 'Preview only — submit disabled'
                : paymentMethod === 'card'
                  ? `Pay ${formatRon(totals?.total || 0)} with card`
                  : `Place order · ${formatRon(totals?.total || 0)}`}
          </Button>
        </form>

        <aside className="h-fit space-y-4 rounded-xl border bg-card p-4 md:sticky md:top-6 md:p-5">
          <h2 className="text-lg font-medium">Order summary</h2>
          <ul className="max-h-64 space-y-3 overflow-y-auto">
            {draft.items.map((line) => (
              <li key={`${line.product_id}:${line.variant_id || ''}`} className="flex gap-3 text-sm">
                {line.image_url ? (
                  <img src={line.image_url} alt="" className="h-14 w-12 rounded object-cover" />
                ) : (
                  <div className="h-14 w-12 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-medium">{line.title}</p>
                  <p className="text-muted-foreground">
                    Qty {line.quantity} · {formatRon(line.unit_price)}
                  </p>
                </div>
                <span className="tabular-nums">{formatRon(line.line_total)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t pt-3 text-sm">
            <Row label="Subtotal" value={formatRon(totals!.subtotal)} />
            {!deliveryConfig.free_delivery && (
              <>
                <Row
                  label={form.delivery_type === 'locker' ? 'Locker delivery' : 'Home delivery'}
                  value={formatRon(totals!.delivery)}
                />
                {customHomePricing && deliveryQuote?.available && (
                  <p className="text-xs text-muted-foreground">
                    {deliveryQuoteSummary(deliveryQuote, (key, options) => {
                      if (key === 'delivery.quoteBreakdown') {
                        return `${formatRon(Number(options?.price || 0))} × ${options?.qty} = ${options?.total}`;
                      }
                      return `Transport ${options?.total ?? formatRon(deliveryQuote.delivery_fee || 0)}`;
                    })}
                  </p>
                )}
              </>
            )}
            {totals!.cash > 0 && (
              <Row
                label={form.delivery_type === 'locker' ? 'Locker card fee' : 'Cash fee'}
                value={formatRon(totals!.cash)}
              />
            )}
            <Row label="Estimated total" value={formatRon(totals!.total)} bold />
            <p className="text-xs text-muted-foreground">
              Product prices come from the signed draft. Delivery and cash fees follow store-api config /
              delivery-quote. Final charged total is computed on the server when the order is placed.
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <p>
              Return store:{' '}
              <a className="underline" href={returnStoreUrl(draft)}>
                {draft.return_origin}
              </a>
            </p>
            <p className="mt-1">Payment selection: {paymentMethod === 'card' ? 'Netopia card' : 'Cash / pay at locker'}</p>
            <p className="mt-1">
              Delivery:{' '}
              {form.delivery_type === 'home'
                ? [form.street, form.street_number, form.city, form.county].filter(Boolean).join(', ') ||
                  'Address pending'
                : form.locker_name || form.locker_address || 'Locker pending'}
            </p>
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
  required,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2.5"
      />
    </label>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'pt-1 text-base font-semibold' : ''}`}>
      <span className={bold ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default function HostedCheckout() {
  return (
    <StorefrontThemeProvider>
      <HostedCheckoutInner />
    </StorefrontThemeProvider>
  );
}
