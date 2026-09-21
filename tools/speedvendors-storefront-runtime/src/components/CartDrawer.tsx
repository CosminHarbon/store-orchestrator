import { useCart } from '../speedvendors';
import { formatPrice } from './ProductCard';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

export default function CartDrawer({ open, onClose, onCheckout }: CartDrawerProps) {
  const { cart, updateQuantity, removeItem } = useCart();
  return (
    <>
      <div className={`sf-scrim${open ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sf-drawer${open ? ' is-open' : ''}`} aria-label="Cart" aria-hidden={!open}>
        <div className="sf-drawer-head">
          <h2>Your cart</h2>
          <button onClick={onClose} aria-label="Close cart">
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
                      <button onClick={() => updateQuantity(line.lineId, line.quantity - 1)} aria-label="Decrease">
                        −
                      </button>
                      <span>{line.quantity}</span>
                      <button onClick={() => updateQuantity(line.lineId, line.quantity + 1)} aria-label="Increase">
                        +
                      </button>
                      <button className="sf-link" onClick={() => removeItem(line.lineId)}>
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
              <button className="sf-btn" onClick={onCheckout}>
                Checkout
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
