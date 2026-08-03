import { useEffect, useState } from 'react';
import { Menu, ShoppingBag, X } from 'lucide-react';
import { useStorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { PremiumCartDrawer } from './PremiumCartDrawer';
import { PremiumCatalog } from './PremiumCatalog';
import { PremiumCheckout } from './PremiumCheckout';
import { PremiumHome } from './PremiumHome';
import { PremiumProduct } from './PremiumProduct';
import './premium.css';

interface PremiumTemplateProps {
  apiKey: string;
}

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap';

export default function PremiumTemplate({ apiKey }: PremiumTemplateProps) {
  const commerce = useStorefrontCommerce(apiKey);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const id = 'premium-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  const { loading, customization, view, setView, openCatalog, cartCount, setCartOpen, collections } =
    commerce;

  if (loading) {
    return (
      <div className="premium-store min-h-screen flex items-center justify-center">
        <div className="w-full max-w-md px-6 space-y-4">
          <div className="prem-skeleton h-8 w-40 mx-auto" />
          <div className="prem-skeleton h-64 w-full" />
          <div className="prem-skeleton h-4 w-3/4 mx-auto" />
          <div className="prem-skeleton h-4 w-1/2 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="premium-store">
      <header className="sticky top-0 z-50 border-b border-[var(--prem-line)] bg-[var(--prem-bg)]/90 backdrop-blur-md">
        <div className="prem-container flex items-center justify-between h-16 md:h-[4.25rem]">
          <button
            type="button"
            className="p-2 rounded-full hover:bg-black/5 md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            <button type="button" className="hover:opacity-70" onClick={() => setView('home')}>
              Home
            </button>
            <button type="button" className="hover:opacity-70" onClick={() => openCatalog()}>
              Shop
            </button>
            {collections.slice(0, 3).map((c) => (
              <button
                key={c.id}
                type="button"
                className="hover:opacity-70"
                onClick={() => openCatalog(c.id)}
              >
                {c.name}
              </button>
            ))}
          </nav>

          <button
            type="button"
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2"
            onClick={() => setView('home')}
          >
            {customization.logo_url ? (
              <img src={customization.logo_url} alt={customization.store_name} className="h-8 w-auto" />
            ) : (
              <span className="text-xl md:text-2xl prem-display tracking-wide">
                {customization.store_name}
              </span>
            )}
          </button>

          <div className="flex items-center gap-1 ml-auto md:ml-0">
            <ThemeToggle className="!text-[var(--prem-ink)] hover:!bg-black/5 dark:hover:!bg-white/10" />
            <button
              type="button"
              className="relative p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setCartOpen(true)}
              aria-label="Open cart"
            >
              <ShoppingBag className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 rounded-full bg-[var(--prem-ink)] text-[var(--prem-bg)] text-[10px] flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[80%] max-w-xs bg-[var(--prem-surface)] p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <span className="prem-display text-2xl">{customization.store_name}</span>
              <button type="button" onClick={() => setMenuOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              className="block w-full text-left py-2"
              onClick={() => {
                setView('home');
                setMenuOpen(false);
              }}
            >
              Home
            </button>
            <button
              type="button"
              className="block w-full text-left py-2"
              onClick={() => {
                openCatalog();
                setMenuOpen(false);
              }}
            >
              Shop
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                className="block w-full text-left py-2 text-[var(--prem-muted)]"
                onClick={() => {
                  openCatalog(c.id);
                  setMenuOpen(false);
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <main>
        {view === 'home' && <PremiumHome commerce={commerce} />}
        {view === 'catalog' && <PremiumCatalog commerce={commerce} />}
        {view === 'product' && <PremiumProduct commerce={commerce} />}
        {view === 'checkout' && <PremiumCheckout commerce={commerce} />}
      </main>

      {view !== 'checkout' && (
        <footer className="border-t border-[var(--prem-line)] bg-[var(--prem-surface)] mt-8">
          <div className="prem-container py-12 md:py-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <h3 className="prem-display text-2xl mb-3">{customization.store_name}</h3>
              <p className="text-sm text-[var(--prem-muted)] leading-relaxed">
                {customization.hero_subtitle || 'Premium products, carefully curated.'}
              </p>
            </div>
            <div>
              <h4 className="text-xs uppercase tracking-[0.18em] text-[var(--prem-muted)] mb-3">Shop</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <button type="button" onClick={() => openCatalog()}>
                    All products
                  </button>
                </li>
                {collections.slice(0, 4).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => openCatalog(c.id)}>
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs uppercase tracking-[0.18em] text-[var(--prem-muted)] mb-3">Help</h4>
              <ul className="space-y-2 text-sm text-[var(--prem-muted)]">
                <li>Shipping & delivery</li>
                <li>Returns</li>
                <li>Privacy policy</li>
                <li>Terms of service</li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs uppercase tracking-[0.18em] text-[var(--prem-muted)] mb-3">Contact</h4>
              <p className="text-sm text-[var(--prem-muted)]">
                Questions about an order? Reach out anytime — we typically reply within one business day.
              </p>
            </div>
          </div>
          <div className="border-t border-[var(--prem-line)] py-4 text-center text-xs text-[var(--prem-muted)]">
            © {new Date().getFullYear()} {customization.store_name}. {customization.footer_text}
          </div>
        </footer>
      )}

      <PremiumCartDrawer commerce={commerce} />
    </div>
  );
}
