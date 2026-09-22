// PROTECTED: storefront header / nav chrome. Cursor may not edit this file.
import type { Merchant } from '../types';

export interface HeaderProps {
  merchant: Merchant | null;
  cartCount: number;
  onOpenCart: () => void;
  onHome: () => void;
}

export default function Header({ merchant, cartCount, onOpenCart, onHome }: HeaderProps) {
  return (
    <header className="sf-header">
      <nav className="sf-nav" aria-label="Primary">
        <button type="button" className="sf-brand" onClick={onHome} aria-label="Home">
          {merchant?.name ?? 'Store'}
        </button>
      </nav>
      <button
        type="button"
        className="sf-cart-btn"
        onClick={onOpenCart}
        aria-label={`Open cart, ${cartCount} items`}
      >
        Cart
        <span className="sf-cart-count">{cartCount}</span>
      </button>
    </header>
  );
}
