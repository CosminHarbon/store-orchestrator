// PROTECTED: cart drawer via commerce.cart. Cursor may not edit this file.
import { useState } from 'react';
import { useCart, useCheckout } from '../hooks';
import { formatPrice } from './formatMoney';
import CheckoutButton from './CheckoutButton';
import { readRuntimeConfig, shouldUseHostedCheckout } from '../runtimeConfig';
import { formatCartVariantLine } from '../variantLabel';

export interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Navigate to protected embedded CheckoutForm view (rollback / mock path). */
  onCheckout: () => void;
}

/** Trusted message type for curated preview iframes → parent app. */
export const SV_HOSTED_CHECKOUT_MESSAGE = 'sv:hosted-checkout' as const;

function resolveReturnOrigin(): string | null {
  const cfg = readRuntimeConfig();
  if (cfg.returnOrigin && cfg.returnOrigin !== 'null') return cfg.returnOrigin;
  if (cfg.hostedCheckoutOrigin && cfg.hostedCheckoutOrigin !== 'null') {
    return cfg.hostedCheckoutOrigin;
  }
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    return window.location.origin;
  }
  return null;
}

/**
 * Top-level pages navigate normally. Sandboxed curated preview iframes cannot safely
 * top-navigate; ask the parent (merchant app) to open a validated checkout URL.
 */
function openHostedCheckoutUrl(checkoutUrl: string) {
  const embedded = typeof window !== 'undefined' && window.self !== window.top;
  if (embedded) {
    try {
      window.parent.postMessage(
        { type: SV_HOSTED_CHECKOUT_MESSAGE, checkoutUrl },
        '*',
      );
      return;
    } catch {
      /* fall through */
    }
  }
  window.location.assign(checkoutUrl);
}

export default function CartDrawer({ open, onClose, onCheckout }: CartDrawerProps) {
  const { cart, updateQuantity, removeItem } = useCart();
  const { startHostedCheckout } = useCheckout();
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCheckout() {
    setHandoffError(null);
    const cfg = readRuntimeConfig();
    if (!shouldUseHostedCheckout(cfg)) {
      onCheckout();
      return;
    }
    const returnOrigin = resolveReturnOrigin();
    if (!returnOrigin) {
      setHandoffError('Missing return origin for checkout handoff.');
      return;
    }
    setBusy(true);
    const result = await startHostedCheckout({
      returnOrigin,
      returnPath: '/',
      hostedCheckoutOrigin: cfg.hostedCheckoutOrigin || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setHandoffError(result.error);
      return;
    }
    openHostedCheckoutUrl(result.checkoutUrl);
  }

  return (
    <>
      <div className={`sf-scrim${open ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sf-drawer${open ? ' is-open' : ''}`} aria-label="Cart" aria-hidden={!open}>
        <div className="sf-drawer-head">
          <h2>Your cart</h2>
          <button type="button" onClick={onClose} aria-label="Close cart">
            ×
          </button>
        </div>
        {cart.lines.length === 0 ? (
          <p className="sf-muted">Your cart is empty.</p>
        ) : (
          <>
            <ul className="sf-lines">
              {cart.lines.map((line) => (
                <li key={line.lineId} className="sf-line">
                  {line.imageUrl && <img src={line.imageUrl} alt="" />}
                  <div className="sf-line-info">
                    <strong>{line.title}</strong>
                    {line.variantLabel && (
                      <span className="sf-muted">
                        {formatCartVariantLine(line.variantLabel, line.variantOptionName)}
                      </span>
                    )}
                    <span>{formatPrice(line.lineTotal.amount, line.lineTotal.currency)}</span>
                    <div className="sf-qty">
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.lineId, line.quantity - 1)}
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(line.lineId, line.quantity + 1)}
                        aria-label="Increase"
                      >
                        +
                      </button>
                      <button type="button" className="sf-link" onClick={() => removeItem(line.lineId)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="sf-drawer-foot">
              <div className="sf-subtotal">
                <span>Subtotal</span>
                <strong>{formatPrice(cart.subtotal.amount, cart.subtotal.currency)}</strong>
              </div>
              <CheckoutButton
                mode="openForm"
                onOpenForm={() => {
                  void handleCheckout();
                }}
                label={busy ? 'Starting checkout…' : 'Checkout'}
                disabled={busy}
              />
              {handoffError && (
                <p className="sf-error" role="alert">
                  {handoffError}
                </p>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
