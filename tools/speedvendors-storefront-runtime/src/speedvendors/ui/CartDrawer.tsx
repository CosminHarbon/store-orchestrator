// PROTECTED: cart drawer via commerce.cart. Cursor may not edit this file.
import { useState } from 'react';
import { useCart, useCheckout } from '../hooks';
import { formatPrice } from './formatMoney';
import CheckoutButton from './CheckoutButton';
import { readRuntimeConfig, shouldUseHostedCheckout } from '../runtimeConfig';

export interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Navigate to protected embedded CheckoutForm view (rollback / mock path). */
  onCheckout: () => void;
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
    setBusy(true);
    const result = await startHostedCheckout({
      returnOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
      returnPath: '/',
      hostedCheckoutOrigin: cfg.hostedCheckoutOrigin || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setHandoffError(result.error);
      return;
    }
    // Full navigation to SpeedVendors-hosted checkout (AI cannot rewrite this URL construction).
    window.location.assign(result.checkoutUrl);
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
                    {line.variantLabel && <span className="sf-muted">Size {line.variantLabel}</span>}
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
