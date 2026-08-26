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
import { fetchStoreConfig } from '@/lib/storefront/api';
import { fontHref, parseStorefrontSpec, type StorefrontSpec } from '@/lib/ai-studio/spec';
import { specCssVariables } from '@/lib/ai-studio/mapToBuilder';
import { FLORIST_FIXTURE } from '@/lib/ai-studio/fixtures';
import { adaptV1SpecToSiteDocument } from '@/lib/ai-studio/v2/adaptV1';
import type { BrandDesignSystem } from '@/lib/ai-studio/v2/designSpec';
import { brandDesignSystemSchema, designSpecSchema } from '@/lib/ai-studio/v2/designSpec';
import { isAiStudioV2Enabled } from '@/lib/ai-studio/v2/featureFlag';
import { siteDocumentSchema, type SiteDocument } from '@/lib/ai-studio/v2/siteTree';
import { brandTokensToCssVars } from '@/lib/ai-studio/v2/tokens';
import { AiSection } from './AiSections';
import SiteTreeRenderer from './v2/SiteTreeRenderer';
import '@/components/templates/premium/premium.css';
import './ai.css';

interface Props {
  apiKey: string;
  demo?: boolean;
  draft?: boolean;
  specOverride?: StorefrontSpec | null;
  /** Phase 2: optional V2 SiteTree override (fixtures / Studio preview). */
  siteDocumentOverride?: SiteDocument | null;
  brandSystemOverride?: BrandDesignSystem | null;
}

export default function AiStorefrontTemplate({
  apiKey,
  demo = false,
  draft = false,
  specOverride = null,
  siteDocumentOverride = null,
  brandSystemOverride = null,
}: Props) {
  const { t } = useTranslation('storefront');
  const commerce = useStorefrontCommerce(apiKey, { demo, theme: 'premium' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadedSpec, setLoadedSpec] = useState<StorefrontSpec | null>(null);
  const [loadedV2Document, setLoadedV2Document] = useState<SiteDocument | null>(null);
  const [loadedV2Brand, setLoadedV2Brand] = useState<BrandDesignSystem | null>(null);
  const [schemaVersion, setSchemaVersion] = useState<number | null>(null);
  const v2Enabled = isAiStudioV2Enabled() || Boolean(siteDocumentOverride) || schemaVersion === 2;

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
              .select('draft_spec, schema_version, draft_document, design_spec, brand_design_system')
              .eq('user_id', user.id)
              .maybeSingle();
            if (!cancelled && data?.schema_version === 2 && data.draft_document) {
              const docParsed = siteDocumentSchema.safeParse(data.draft_document);
              if (docParsed.success) setLoadedV2Document(docParsed.data);
              if (data.brand_design_system) {
                const brandParsed = brandDesignSystemSchema.safeParse(data.brand_design_system);
                if (brandParsed.success) setLoadedV2Brand(brandParsed.data);
              }
              if (data.design_spec) designSpecSchema.safeParse(data.design_spec);
              setSchemaVersion(2);
              if (data.draft_spec) {
                setLoadedSpec(parseStorefrontSpec(data.draft_spec).spec);
              }
              return;
            }
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

  const v2Payload = useMemo(() => {
    if (!v2Enabled) return null;
    if (siteDocumentOverride && brandSystemOverride) {
      return { document: siteDocumentOverride, brandSystem: brandSystemOverride };
    }
    if (loadedV2Document && loadedV2Brand) {
      return { document: siteDocumentOverride || loadedV2Document, brandSystem: brandSystemOverride || loadedV2Brand };
    }
    if (!spec) return null;
    // V1 adapter only when no persisted V2 document exists (legacy / flag preview)
    if (schemaVersion === 2) return null;
    const adapted = adaptV1SpecToSiteDocument(spec);
    return {
      document: siteDocumentOverride || adapted.document,
      brandSystem: brandSystemOverride || adapted.brandSystem,
    };
  }, [spec, v2Enabled, siteDocumentOverride, brandSystemOverride, loadedV2Document, loadedV2Brand, schemaVersion]);

  useEffect(() => {
    const fonts = spec
      ? { heading: spec.tokens.headingFont, body: spec.tokens.bodyFont }
      : v2Payload?.brandSystem
        ? { heading: v2Payload.brandSystem.tokens.headingFont, body: v2Payload.brandSystem.tokens.bodyFont }
        : null;
    if (!fonts) return;
    const id = 'ai-studio-fonts';
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = fontHref(fonts.heading, fonts.body);
  }, [spec, v2Payload?.brandSystem]);

  const cssVars = useMemo(() => {
    if (spec) return specCssVariables(spec);
    if (v2Payload?.brandSystem) return brandTokensToCssVars(v2Payload.brandSystem);
    return {};
  }, [spec, v2Payload?.brandSystem]);

  const { loading, customization, view, setView, openCatalog, cartCount, setCartOpen, collections } = commerce;

  if (loading || (!spec && !v2Payload)) {
    return (
      <div className="ai-store min-h-screen flex items-center justify-center">
        <p className="text-sm opacity-60 animate-pulse">Designing your store…</p>
      </div>
    );
  }

  const layoutId = spec?.layoutId || 'atelier';
  const density = spec?.density || 'airy';
  const nav = spec?.nav || {
    style: spec?.tokens.navbarStyle,
    layout: 'logoCenter' as const,
    showCollections: true,
    sticky: true,
  };
  const useV2Home = Boolean(v2Payload);
  const storeName =
    spec?.copy.storeName ||
    (v2Payload?.document.pages.home.nodes.find((n) => n.type === 'nav')?.content?.storeName as string | undefined) ||
    'Store';
  const headerVisible =
    !useV2Home && spec?.pages.home.sections.find((s) => s.type === 'header')?.visible !== false;
  const footerVisible =
    !useV2Home && spec?.pages.home.sections.find((s) => s.type === 'footer')?.visible !== false;
  const sticky = nav.sticky !== false && nav.style !== 'transparent';
  const btnRadius = spec?.tokens.buttonStyle === 'pill' ? 'rounded-full' : spec?.tokens.radius || 'rounded-lg';
  const navStyle =
    nav.style === 'solid' ? 'ai-nav-solid' : nav.style === 'transparent' ? 'ai-nav-transparent' : 'ai-nav-glass';
  const navLayout = nav.layout || 'logoCenter';
  const collectionLinks = nav.showCollections === false ? [] : collections.slice(0, 3);

  const brand = (
    <button type="button" className="flex items-center gap-2" onClick={() => setView('home')}>
      {spec?.copy.logoUrl || customization.logo_url ? (
        <img src={spec?.copy.logoUrl || customization.logo_url || ''} alt={storeName} className="h-8 w-auto" />
      ) : (
        <span className="text-xl ai-display">{storeName}</span>
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
      {spec?.customCss ? <style>{spec.customCss}</style> : null}
      {demo && <StorefrontDemoBanner />}
      {headerVisible && (
        <header
          className={`${sticky ? 'sticky top-0 z-50' : ''} border-b ${navStyle}`}
          style={{ borderColor: `${spec?.tokens.text || v2Payload?.brandSystem.tokens.text || '#000'}14` }}
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
          <div className="absolute left-0 top-0 h-full w-[80%] max-w-xs p-6 space-y-3" style={{ background: spec?.tokens.secondary || v2Payload?.brandSystem.tokens.secondary || '#fff' }}>
            <div className="flex justify-between items-center mb-4">
              <span className="ai-display text-2xl">{storeName}</span>
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
        {view === 'home' && useV2Home && v2Payload && (
          <SiteTreeRenderer document={v2Payload.document} brand={v2Payload.brandSystem} commerce={commerce} />
        )}
        {view === 'home' && !useV2Home && spec && (
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

      {footerVisible && view !== 'checkout' && spec && (
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
