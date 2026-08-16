import { useEffect, useState } from 'react';
import { Menu, ShoppingBag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { StorefrontDemoBanner } from '@/components/templates/StorefrontDemoBanner';
import { StorefrontLanguageToggle } from '@/components/templates/StorefrontLanguageToggle';
import { FloralCartDrawer } from './FloralCartDrawer';
import { FloralCatalog } from './FloralCatalog';
import { FloralCheckout } from './FloralCheckout';
import { FloralHome } from './FloralHome';
import { FloralProduct } from './FloralProduct';
import './floral.css';

interface FloralTemplateProps {
  apiKey: string;
  demo?: boolean;
}

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700&display=swap';

export default function FloralTemplate({ apiKey, demo = false }: FloralTemplateProps) {
  const { t } = useTranslation('storefront');
  const commerce = useStorefrontCommerce(apiKey, { demo, theme: 'floral' });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const id = 'floral-fonts';
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
      <div className="floral-store min-h-screen flex items-center justify-center">
        <div className="w-full max-w-md px-6 space-y-4">
          <div className="floral-skeleton h-8 w-48 mx-auto" />
          <div className="floral-skeleton h-72 w-full" />
          <div className="floral-skeleton h-4 w-3/4 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="floral-store">
      {demo && (
        <StorefrontDemoBanner className="border-[var(--floral-line)] bg-[var(--floral-blush)] text-[var(--floral-ink)]" />
      )}
      <header className="sticky top-0 z-50 border-b border-[var(--floral-line)] bg-[var(--floral-bg)]/92 backdrop-blur-md">
        <div className="floral-container flex items-center justify-between h-[4.25rem]">
          <button
            type="button"
            className="p-2 md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label={t('nav.openMenu')}
          >
            <Menu className="h-5 w-5" strokeWidth={1.25} />
          </button>

          <nav className="hidden md:flex items-center gap-8 text-[0.72rem] tracking-[0.18em] uppercase text-[var(--floral-muted)]">
            <button type="button" className="hover:text-[var(--floral-ink)]" onClick={() => setView('home')}>
              {t('nav.home')}
            </button>
            <button type="button" className="hover:text-[var(--floral-ink)]" onClick={() => openCatalog()}>
              {t('nav.shop')}
            </button>
            {collections.slice(0, 3).map((c) => (
              <button
                key={c.id}
                type="button"
                className="hover:text-[var(--floral-ink)]"
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
              <span className="text-2xl md:text-[1.75rem] floral-display tracking-[0.08em]">
                {customization.store_name}
              </span>
            )}
          </button>

          <div className="flex items-center gap-1 ml-auto md:ml-0">
            <StorefrontLanguageToggle
              compact
              className="border-[var(--floral-line)] text-[var(--floral-ink)]"
            />
            <ThemeToggle className="!text-[var(--floral-ink)] hover:!bg-black/5 dark:hover:!bg-white/10" />
            <button
              type="button"
              className="relative p-2"
              onClick={() => setCartOpen(true)}
              aria-label={t('nav.openCart')}
            >
              <ShoppingBag className="h-5 w-5" strokeWidth={1.25} />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 rounded-full bg-[var(--floral-rose-deep)] text-white text-[10px] flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button type="button" className="absolute inset-0 bg-black/35" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[82%] max-w-xs bg-[var(--floral-surface)] p-6 space-y-3 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <span className="floral-display text-2xl">{customization.store_name}</span>
              <button type="button" onClick={() => setMenuOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              className="block w-full text-left py-2.5 text-sm tracking-[0.14em] uppercase"
              onClick={() => {
                setView('home');
                setMenuOpen(false);
              }}
            >
              {t('nav.home')}
            </button>
            <button
              type="button"
              className="block w-full text-left py-2.5 text-sm tracking-[0.14em] uppercase"
              onClick={() => {
                openCatalog();
                setMenuOpen(false);
              }}
            >
              {t('nav.shop')}
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                className="block w-full text-left py-2.5 text-sm text-[var(--floral-muted)]"
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
        {view === 'home' && <FloralHome commerce={commerce} />}
        {view === 'catalog' && <FloralCatalog commerce={commerce} />}
        {view === 'product' && <FloralProduct commerce={commerce} />}
        {view === 'checkout' && <FloralCheckout commerce={commerce} />}
      </main>

      {view !== 'checkout' && (
        <footer className="border-t border-[var(--floral-line)] bg-[var(--floral-surface)] mt-4">
          <div className="floral-container py-14 md:py-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            <div>
              <h3 className="floral-display text-3xl mb-3">{customization.store_name}</h3>
              <p className="text-sm text-[var(--floral-muted)] leading-relaxed">
                {customization.hero_subtitle}
              </p>
            </div>
            <div>
              <h4 className="floral-eyebrow mb-4">{t('footer.shop')}</h4>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <button type="button" onClick={() => openCatalog()}>
                    {t('nav.allProducts')}
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
              <h4 className="floral-eyebrow mb-4">{t('footer.delivery')}</h4>
              <ul className="space-y-2.5 text-sm text-[var(--floral-muted)]">
                <li>{t('footer.homeDelivery')}</li>
                <li>{t('footer.lockerPickup')}</li>
                <li>{t('footer.cardCash')}</li>
              </ul>
            </div>
            <div>
              <h4 className="floral-eyebrow mb-4">{t('footer.note')}</h4>
              <p className="text-sm text-[var(--floral-muted)] leading-relaxed">
                {customization.footer_text}
              </p>
            </div>
          </div>
        </footer>
      )}

      <FloralCartDrawer commerce={commerce} />
    </div>
  );
}
