import { Menu, ShoppingBag, X } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useStorefrontCommerce } from '@/hooks/useStorefrontCommerce';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { StorefrontDemoBanner } from '@/components/templates/StorefrontDemoBanner';
import { StorefrontLanguageToggle } from '@/components/templates/StorefrontLanguageToggle';
import { PremiumCartDrawer } from '@/components/templates/premium/PremiumCartDrawer';
import { PremiumCatalog } from '@/components/templates/premium/PremiumCatalog';
import { PremiumCheckout } from '@/components/templates/premium/PremiumCheckout';
import { PremiumProduct } from '@/components/templates/premium/PremiumProduct';
import { supabase } from '@/integrations/supabase/client';
import { fontHref, parseStorefrontSpec, type StorefrontSpec } from '@/lib/ai-studio/spec';
import { specCssVariables } from '@/lib/ai-studio/mapToBuilder';
import { FLORIST_FIXTURE } from '@/lib/ai-studio/fixtures';
import { fetchStoreConfig } from '@/lib/storefront/api';
import { AiSection } from './AiSections';
import '@/components/templates/premium/premium.css';
import './ai.css';

interface Props {
  apiKey: string;
  demo?: boolean;
  draft?: boolean;
  specOverride?: StorefrontSpec | null;
}

export default function AiStorefrontTemplate({ apiKey, demo = false, draft = false, specOverride = null }: Props) {
  const { t } = useTranslation('storefront');
  const commerce = useStorefrontCommerce(apiKey, { demo, theme: 'premium' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadedSpec, setLoadedSpec] = useState<StorefrontSpec | null>(null);

  useEffect(() => {
    if (specOverride) {
      setLoadedSpec(specOverride);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (draft) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase
              .from('ai_storefronts')
              .select('draft_spec')
              .eq('user_id', user.id)
              .maybeSingle();
            if (!cancelled && data?.draft_spec) {
              setLoadedSpec(parseStorefrontSpec(data.draft_spec).spec);
              return;
            }
          }
        }
        const cfg = await fetchStoreConfig(apiKey, { templateId: 'ai' });
        if (!cancelled && cfg.aiSpec) {
          setLoadedSpec(parseStorefrontSpec(cfg.aiSpec).spec);
          return;
        }
        if (!cancelled) setLoadedSpec(FLORIST_FIXTURE);
      } catch {
        if (!cancelled) setLoadedSpec(FLORIST_FIXTURE);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey, draft, specOverride]);

  const spec = specOverride || loadedSpec;

  useEffect(() => {
    if (!spec) return;
    const id = 'ai-studio-fonts';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = fontHref(spec.tokens.headingFont, spec.tokens.bodyFont);
  }, [spec]);

  const cssVars = useMemo(() => (spec ? specCssVariables(spec) : {}), [spec]);
  const { loading, customization, view, setView, openCatalog, cartCount, setCartOpen, collections } = commerce;

  if (loading || !spec) {
    return (
      <div className="ai-store min-h-screen flex items-center justify-center">
        <p className="text-sm opacity-60 animate-pulse">Designing your store…</p>
      </div>
    );
  }

  const layoutId = spec.layoutId || 'atelier';
  const density = spec.density || 'airy';
  const nav = spec.nav || {
    style: spec.tokens.navbarStyle,
    layout: 'logoCenter' as const,
    showCollections: true,
    sticky: true,
  };
  const headerVisible = spec.pages.home.sections.find((s) => s.type === 'header')?.visible !== false;
  const footerVisible = spec.pages.home.sections.find((s) => s.type === 'footer')?.visible !== false;
  const sticky = nav.sticky !== false && nav.style !== 'transparent';
  const btnRadius = spec.tokens.buttonStyle === 'pill' ? 'rounded-full' : spec.tokens.radius;
  const navStyle =
    nav.style === 'solid' ? 'ai-nav-solid' : nav.style === 'transparent' ? 'ai-nav-transparent' : 'ai-nav-glass';
  const navLayout = nav.layout || 'logoCenter';
  const collectionLinks = nav.showCollections === false ? [] : collections.slice(0, 3);

  const brand = (
    <button type="button" className="flex items-center gap-2" onClick={() => setView('home')}>
      {spec.copy.logoUrl || customization.logo_url ? (
        <img src={spec.copy.logoUrl || customization.logo_url || ''} alt={spec.copy.storeName} className="h-8 w-auto" />
      ) : (
        <span className="text-xl ai-display">{spec.copy.storeName}</span>
      )}
    </button>
  );

  const links = (
    <nav className="hidden md:flex items-center gap-6 text-sm">
      <button type="button" onClick={() => setView('home')}>{t('nav.home')}</button>
      <button type="button" onClick={() => openCatalog()}>{t('nav.shop')}</button>
      {collectionLinks.map((c) => (
        <button key={c.id} type="button" onClick={() => openCatalog(c.id)}>
          {c.name}
        </button>
      ))}
    </nav>
  );

  const actions = (
    <div className="flex items-center gap-1">
      <StorefrontLanguageToggle compact />
      <ThemeToggle />
      <button type="button" className="relative p-2" onClick={() => setCartOpen(true)} aria-label={t('nav.openCart')}>
        <ShoppingBag className="h-5 w-5" />
        {cartCount > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center bg-[var(--ai-primary)] text-white ${btnRadius}`}>
            {cartCount}
          </span>
        )}
      </button>
    </div>
  );

  return (
    <div className={`premium-store ai-store ai-layout-${layoutId} ai-density-${density}`} style={cssVars as CSSProperties}>
      {spec.customCss ? <style>{spec.customCss}</style> : null}
      {demo && <StorefrontDemoBanner />}
      {headerVisible && (
        <header
          className={`${sticky ? 'sticky top-0 z-50' : ''} border-b ${navStyle}`}
          style={{ borderColor: `${spec.tokens.text}14` }}
        >
          <div className={`ai-container flex items-center h-16 gap-4 ${navLayout === 'logoLeft' ? 'justify-start' : 'justify-between'}`}>
            <button type="button" className="p-2 md:hidden" onClick={() => setMenuOpen(true)} aria-label={t('nav.openMenu')}>
              <Menu className="h-5 w-5" />
            </button>
            {navLayout === 'logoLeft' && (
              <>
                {brand}
                <div className="ml-6 flex-1">{links}</div>
                <div className="ml-auto">{actions}</div>
              </>
            )}
            {navLayout === 'split' && (
              <>
                {links}
                <div className="absolute left-1/2 -translate-x-1/2">{brand}</div>
                <div className="ml-auto">{actions}</div>
              </>
            )}
            {navLayout === 'logoCenter' && (
              <>
                {links}
                <div className="absolute left-1/2 -translate-x-1/2">{brand}</div>
                <div className="ml-auto">{actions}</div>
              </>
            )}
          </div>
        </header>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[80%] max-w-xs p-6 space-y-3" style={{ background: spec.tokens.secondary }}>
            <div className="flex justify-between items-center mb-4">
              <span className="ai-display text-2xl">{spec.copy.storeName}</span>
              <button type="button" onClick={() => setMenuOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <button type="button" className="block w-full text-left py-2" onClick={() => { setView('home'); setMenuOpen(false); }}>
              {t('nav.home')}
            </button>
            <button type="button" className="block w-full text-left py-2" onClick={() => { openCatalog(); setMenuOpen(false); }}>
              {t('nav.shop')}
            </button>
          </div>
        </div>
      )}

      <main>
        {view === 'home' && (
          <div>
            {spec.pages.home.sections.map((section) => (
              <AiSection key={section.id} spec={spec} commerce={commerce} section={section} />
            ))}
          </div>
        )}
        {view === 'catalog' && <PremiumCatalog commerce={commerce} />}
        {view === 'product' && <PremiumProduct commerce={commerce} />}
        {view === 'checkout' && <PremiumCheckout commerce={commerce} />}
      </main>

      {footerVisible && view !== 'checkout' && (
        <footer className="border-t" style={{ borderColor: `${spec.tokens.text}14`, background: spec.tokens.secondary }}>
          <div className="ai-container py-16 grid sm:grid-cols-2 gap-8">
            <div>
              <h3 className="ai-display text-3xl mb-3">{spec.copy.storeName}</h3>
              <p className="text-sm opacity-70 max-w-md leading-relaxed">{spec.copy.heroSubtitle}</p>
            </div>
            <p className="text-sm opacity-70 self-end">{spec.copy.footer}</p>
          </div>
        </footer>
      )}

      <PremiumCartDrawer commerce={commerce} />
    </div>
  );
}
