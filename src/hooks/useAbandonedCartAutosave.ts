import { useEffect, useRef } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AbandonedCartView = 'home' | 'product' | 'cart' | 'checkout';

export interface AbandonedCartFormSnapshot {
  name: string;
  email: string;
  phone: string;
  delivery_type: 'home' | 'locker';
  city: string;
  county: string;
  street: string;
  street_number: string;
  block: string;
  apartment: string;
  selected_carrier_code: string;
  locker_id: string;
  locker_name: string;
  locker_address: string;
  notes?: string;
}

export interface AbandonedCartItemSnapshot {
  product_id: string;
  title: string;
  price: number;
  quantity: number;
}

function storageKey(apiKey: string) {
  return `so_cart_session_${apiKey}`;
}

export function getOrCreateCartSessionToken(apiKey: string): string {
  if (typeof window === 'undefined') return '';
  const key = storageKey(apiKey);
  let token = localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(key, token);
  }
  return token;
}

function buildPayloadHash(payload: Record<string, unknown>) {
  return JSON.stringify(payload);
}

interface UseAbandonedCartAutosaveArgs {
  apiBase: string;
  apiKey: string;
  enabled?: boolean;
  view: AbandonedCartView;
  paymentMethod: 'card' | 'cash';
  checkoutForm: AbandonedCartFormSnapshot;
  items: AbandonedCartItemSnapshot[];
  cartSubtotal: number;
  estimatedTotal: number;
}

/**
 * Debounced abandoned-cart upsert. Never touches checkout_sessions or orders.
 * Gate: cart has items AND (valid email OR checkout view opened).
 */
export function useAbandonedCartAutosave({
  apiBase,
  apiKey,
  enabled = true,
  view,
  paymentMethod,
  checkoutForm,
  items,
  cartSubtotal,
  estimatedTotal,
}: UseAbandonedCartAutosaveArgs) {
  const lastHashRef = useRef<string>('');
  const hasOpenedCheckoutRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const convertedRef = useRef(false);

  useEffect(() => {
    if (view === 'checkout') {
      hasOpenedCheckoutRef.current = true;
    }
  }, [view]);

  useEffect(() => {
    if (!enabled || !apiKey || convertedRef.current) return;

    const sessionToken = getOrCreateCartSessionToken(apiKey);
    if (!sessionToken) return;

    const hasItems = items.length > 0;
    const hasValidEmail = EMAIL_RE.test((checkoutForm.email || '').trim());
    const shouldTrack = hasItems && (hasValidEmail || hasOpenedCheckoutRef.current);

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Empty cart: discard existing active abandoned cart (if any was saved)
    if (!hasItems) {
      if (lastHashRef.current) {
        timerRef.current = window.setTimeout(() => {
          void fetch(`${apiBase}/abandoned-carts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
            },
            body: JSON.stringify({
              action: 'discard',
              session_token: sessionToken,
            }),
          }).catch(() => {
            /* non-blocking */
          });
          lastHashRef.current = '';
        }, 2000);
      }
      return;
    }

    if (!shouldTrack) return;

    const customerAddress =
      checkoutForm.delivery_type === 'home'
        ? [checkoutForm.street, checkoutForm.street_number, checkoutForm.city, checkoutForm.county]
            .filter(Boolean)
            .join(', ')
        : checkoutForm.locker_address || '';

    const checkoutStep =
      view === 'checkout'
        ? hasValidEmail && checkoutForm.name
          ? 'ready'
          : 'checkout'
        : 'cart';

    const payload = {
      action: 'upsert' as const,
      session_token: sessionToken,
      customer_name: checkoutForm.name || null,
      customer_email: checkoutForm.email || null,
      customer_phone: checkoutForm.phone || null,
      customer_address: customerAddress || null,
      customer_city: checkoutForm.city || null,
      customer_county: checkoutForm.county || null,
      customer_street: checkoutForm.street || null,
      customer_street_number: checkoutForm.street_number || null,
      customer_block: checkoutForm.block || null,
      customer_apartment: checkoutForm.apartment || null,
      delivery_type: checkoutForm.delivery_type || null,
      selected_carrier_code: checkoutForm.selected_carrier_code || null,
      locker_id: checkoutForm.locker_id || null,
      locker_name: checkoutForm.locker_name || null,
      locker_address: checkoutForm.locker_address || null,
      payment_method: paymentMethod,
      items,
      cart_subtotal: cartSubtotal,
      estimated_total: estimatedTotal,
      checkout_step: checkoutStep,
    };

    const hash = buildPayloadHash(payload);
    if (hash === lastHashRef.current) return;

    timerRef.current = window.setTimeout(() => {
      void fetch(`${apiBase}/abandoned-carts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          if (res.ok) lastHashRef.current = hash;
        })
        .catch(() => {
          /* non-blocking — never interrupt checkout */
        });
    }, 2000);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    enabled,
    apiBase,
    apiKey,
    view,
    paymentMethod,
    checkoutForm,
    items,
    cartSubtotal,
    estimatedTotal,
  ]);

  return {
    getSessionToken: () => getOrCreateCartSessionToken(apiKey),
    markConvertedLocally: () => {
      convertedRef.current = true;
      lastHashRef.current = '';
    },
  };
}
