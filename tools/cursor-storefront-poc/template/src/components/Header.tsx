import type { Merchant } from '../speedvendors';

interface HeaderProps {
  merchant: Merchant | null;
  cartCount: number;
  onOpenCart: () => void;
  onHome: () => void;
}

export default function Header({ merchant, cartCount, onOpenCart, onHome }: HeaderProps) {
  return (
    <header className="sf-header">
      <button className="sf-brand" onClick={onHome} aria-label="Home">
        {merchant?.name ?? 'Store'}
      </button>
      <button className="sf-cart-btn" onClick={onOpenCart} aria-label={`Open cart, ${cartCount} items`}>
        Cart
        <span className="sf-cart-count">{cartCount}</span>
      </button>
    </header>
  );
}
