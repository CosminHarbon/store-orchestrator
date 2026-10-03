import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  type MotionProps,
} from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import {
  ArrowRight,
  BarChart3,
  Check,
  CreditCard,
  FileText,
  Globe,
  HeartHandshake,
  Info,
  Menu,
  Minus,
  Package,
  Palette,
  Plug,
  Plus,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Truck,
  Users,
  Video,
  Warehouse,
  X,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { HeroMockup } from '@/components/landing/HeroMockup';
import { SetupRequestDialog } from '@/components/landing/SetupRequestDialog';
import { SpotlightCard } from '@/components/landing/SpotlightCard';
import { useLanguage } from '@/i18n/LanguageProvider';
import {
  advertisedMonthlyEquivalent,
  advertisedPrice,
  ASSISTED_SETUP_FEE_RON,
  ASSISTED_SETUP_PRODUCT_COUNT,
  ASSISTED_SETUP_TRAINING_MINUTES,
  formatLei,
} from '@/lib/marketingPricing';
import { SPEEDVENDORS_PLANS, SPEEDVENDORS_TIERS } from '@/lib/plans/catalogue';
import { cn } from '@/lib/utils';
import '@/styles/marketing.css';

const NAV_IDS = ['included', 'how-it-works', 'features', 'pricing', 'faq'] as const;
type NavId = (typeof NAV_IDS)[number];

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Order matches landing.included.items: design, products, integrations, adjustments, training. */
const INCLUDED_ICONS = [Palette, Package, Plug, SlidersHorizontal, Video] as const;

/** Order matches landing.platform.items. */
const FEATURE_ICONS = [Package, Warehouse, ShoppingBag, CreditCard, Truck, FileText, Users, BarChart3] as const;

/** Interpolation values shared by every offer string, so copy and numbers never drift apart. */
const OFFER = {
  setup: formatLei(ASSISTED_SETUP_FEE_RON),
  from: formatLei(SPEEDVENDORS_PLANS.start.monthlyAmountRon),
  products: ASSISTED_SETUP_PRODUCT_COUNT,
  minutes: ASSISTED_SETUP_TRAINING_MINUTES,
};

function Section({
  id,
  className,
  children,
  fullBleed,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  fullBleed?: boolean;
}) {
  return (
    <section id={id} className={cn('relative', fullBleed ? '' : 'px-4 sm:px-6 lg:px-8', className)}>
      {fullBleed ? children : <div className="mx-auto max-w-6xl">{children}</div>}
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  center,
  reveal,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
  reveal: MotionProps;
}) {
  return (
    <motion.div {...reveal} className={cn('mb-12 sm:mb-16 max-w-2xl space-y-4', center && 'mx-auto text-center')}>
      {eyebrow ? <p className="sv-eyebrow">{eyebrow}</p> : null}
      <h2 className="sv-h2">{title}</h2>
      {subtitle ? <p className="sv-lead">{subtitle}</p> : null}
    </motion.div>
  );
}

function FaqItem({
  q,
  a,
  open,
  onToggle,
  index,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
  index: number;
}) {
  return (
    <div className="sv-faq-item" data-open={open}>
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`faq-panel-${index}`}
          id={`faq-trigger-${index}`}
          className="flex w-full items-center justify-between gap-4 rounded-[inherit] px-5 py-4 sm:px-6 sm:py-5 text-left font-display text-base sm:text-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--sv-accent))]"
        >
          {q}
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--sv-line))] transition-colors',
              open && 'border-transparent bg-[hsl(var(--sv-accent))] text-white'
            )}
          >
            {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={`faq-panel-${index}`}
            role="region"
            aria-labelledby={`faq-trigger-${index}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 sm:px-6 sm:pb-6 text-sm sm:text-base leading-relaxed text-[hsl(var(--sv-ink))]/65">
              {a}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Mounted only once translations are ready so the scroll target ref is always attached. */
function HowItWorks({ steps, reveal }: { steps: { title: string; desc: string }[]; reveal: (delay?: number) => MotionProps }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 60%'] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.3 });

  return (
    <ol ref={ref} className="relative grid gap-10 md:grid-cols-3 md:gap-8">
      <span className="absolute left-[1.55rem] top-4 bottom-4 w-px bg-[hsl(var(--sv-line))] md:hidden" aria-hidden />
      <motion.span
        className="absolute left-[1.55rem] top-4 bottom-4 w-px origin-top bg-gradient-to-b from-[hsl(var(--sv-accent))] to-[hsl(var(--sv-cyan))] md:hidden"
        style={{ scaleY: progress }}
        aria-hidden
      />
      <span className="absolute left-[16%] right-[16%] top-[1.55rem] hidden h-px bg-[hsl(var(--sv-line))] md:block" aria-hidden />
      <motion.span
        className="absolute left-[16%] right-[16%] top-[1.55rem] hidden h-px origin-left bg-gradient-to-r from-[hsl(var(--sv-accent))] to-[hsl(var(--sv-cyan))] md:block"
        style={{ scaleX: progress }}
        aria-hidden
      />
      {steps.map((step, i) => (
        <motion.li key={step.title} {...reveal(i * 0.1)} className="relative flex gap-5 md:block md:space-y-5 md:text-center">
          <span className="relative z-10 flex h-[3.1rem] w-[3.1rem] shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))] font-display text-lg font-bold text-[hsl(var(--sv-accent))] shadow-[0_14px_30px_-18px_hsl(var(--sv-accent))] md:mx-auto">
            {String(i + 1).padStart(2, '0')}
          </span>
          <span className="block space-y-2 md:px-3">
            <span className="block font-display text-xl font-semibold">{step.title}</span>
            <span className="block text-sm sm:text-base leading-relaxed text-[hsl(var(--sv-ink))]/60">{step.desc}</span>
          </span>
        </motion.li>
      ))}
    </ol>
  );
}

export default function Landing() {
  const { t, ready } = useTranslation('auth');
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavId | null>(null);
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [requestOpen, setRequestOpen] = useState(false);

  const { scrollYProgress } = useScroll();
  const barScale = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.25 });

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      navigate('/welcome', { replace: true });
    }
  }, [navigate]);

  // Login and the self-serve trial lead to /auth. Warm that chunk once the page is idle so the
  // click is instant even though routes are code-split.
  useEffect(() => {
    const warm = () => void import('./Auth');
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 2500);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveNav(entry.target.id as NavId);
        }
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    NAV_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ready]);

  const heroHighlights = t('landing.hero.highlights', { returnObjects: true, ...OFFER });
  const includedItems = t('landing.included.items', { returnObjects: true, ...OFFER });
  const trainingItems = t('landing.included.training', { returnObjects: true });
  const howSteps = t('landing.how.steps', { returnObjects: true, ...OFFER });
  const featureItems = t('landing.platform.items', { returnObjects: true });
  const trustItems = t('landing.trust.items', { returnObjects: true });
  const setupItems = t('landing.pricing.setupItems', { returnObjects: true, ...OFFER });
  const planIncluded = t('landing.pricing.included', { returnObjects: true });
  const faqItems = t('landing.faq.items', { returnObjects: true, ...OFFER });

  if (
    !ready ||
    !Array.isArray(heroHighlights) ||
    !Array.isArray(includedItems) ||
    !Array.isArray(trainingItems) ||
    !Array.isArray(howSteps) ||
    !Array.isArray(featureItems) ||
    !Array.isArray(trustItems) ||
    !Array.isArray(setupItems) ||
    !Array.isArray(planIncluded) ||
    !Array.isArray(faqItems)
  ) {
    return (
      <div className="sv-marketing min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-[hsl(var(--sv-accent))] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const highlights = heroHighlights as string[];
  const included = includedItems as { title: string; desc: string }[];
  const training = trainingItems as string[];
  const steps = howSteps as { title: string; desc: string }[];
  const features = featureItems as { title: string; desc: string }[];
  const trust = trustItems as { name: string; role: string }[];
  const setupList = setupItems as string[];
  const planList = planIncluded as string[];
  const faqs = faqItems as { q: string; a: string }[];

  const reveal = (delay = 0): MotionProps =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-60px' },
          transition: { duration: 0.6, delay, ease: EASE },
        };

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  const openRequest = () => {
    setMenuOpen(false);
    setRequestOpen(true);
  };

  const languageSwitcher = (
    <span className="inline-flex items-center gap-0.5" role="group" aria-label={t('landing.nav.language')}>
      <Globe className="h-4 w-4 shrink-0 text-[hsl(var(--sv-ink))]/55" aria-hidden />
      {(['ro', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          className="sv-btn sv-btn--plain sv-btn--sm"
          onClick={() => void setLanguage(code)}
          aria-pressed={language === code}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </span>
  );

  const assistedSetupCard = (
    <motion.div
      {...reveal()}
      data-testid="landing-pricing-setup"
      className="sv-card sv-card--featured mx-auto grid max-w-5xl gap-8 p-6 sm:p-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12"
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--sv-ink))]/45">
          {t('landing.pricing.setupLabel')}
        </p>
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-gradient-to-r from-[hsl(var(--sv-accent))] to-[hsl(var(--sv-pink))] px-3 py-1 text-[11px] font-bold text-white">
          <HeartHandshake className="h-3 w-3" />
          {t('landing.pricing.setupTag')}
        </span>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">{OFFER.setup}</span>
          <span className="text-sm text-[hsl(var(--sv-ink))]/55">{t('landing.pricing.setupOnce')}</span>
        </div>
        <p className="text-sm leading-relaxed text-[hsl(var(--sv-ink))]/60">{t('landing.pricing.setupDesign', OFFER)}</p>
        <p className="text-sm leading-relaxed text-[hsl(var(--sv-ink))]/60">{t('landing.included.after', OFFER)}</p>
        <div className="mt-auto pt-2">
          <button
            type="button"
            onClick={openRequest}
            className="sv-btn sv-btn--primary sv-btn--lg w-full sm:w-auto"
            data-testid="landing-pricing-setup-cta"
          >
            {t('landing.hero.ctaPrimary')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ul className="space-y-3 self-center">
        {setupList.map((item) => (
          <li key={item} className="flex gap-3 text-sm sm:text-base text-[hsl(var(--sv-ink))]/80">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--sv-accent))]">
              <Check className="h-3 w-3 text-white" strokeWidth={3} />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </motion.div>
  );

  return (
    <div className="sv-marketing min-h-screen">
      {/* Scroll progress */}
      <motion.div
        className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-[hsl(var(--sv-accent))] via-[hsl(var(--sv-pink))] to-[hsl(var(--sv-cyan))]"
        style={{ scaleX: reduceMotion ? scrollYProgress : barScale }}
        aria-hidden
      />

      {/* Floating navigation */}
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="mx-auto max-w-6xl">
          <div
            className="sv-nav flex h-14 items-center justify-between gap-3 pl-4 pr-2 sm:pl-5"
            data-scrolled={scrolled || menuOpen}
          >
            <Link to="/" className="flex shrink-0 items-center" aria-label="SpeedVendors">
              <BrandLogo variant="horizontal" imgClassName="h-7 w-auto max-w-[170px]" />
            </Link>

            <nav className="hidden lg:flex items-center gap-1" aria-label="Primary">
              {NAV_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => scrollTo(id)}
                  aria-current={activeNav === id}
                  className="sv-nav-link"
                >
                  {activeNav === id ? (
                    <motion.span layoutId="nav-pill" className="sv-nav-link__pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                  ) : null}
                  {t(`landing.nav.${id}`)}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-1 sm:gap-1.5">
              <span className="hidden sm:inline-flex">{languageSwitcher}</span>
              <ThemeToggle />
              <span className="hidden sm:inline-flex">
                <Link to="/auth?tab=signin" className="sv-btn sv-btn--plain sv-btn--sm">
                  {t('landing.nav.login')}
                </Link>
              </span>
              <button
                type="button"
                onClick={openRequest}
                className="sv-btn sv-btn--primary sv-btn--sm"
                data-testid="landing-nav-setup-cta"
              >
                {t('landing.nav.getStarted')}
              </button>
              <span className="inline-flex lg:hidden">
                <button
                  type="button"
                  className="sv-btn sv-btn--plain sv-btn--sm !px-2.5"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-controls="landing-mobile-menu"
                  aria-label={menuOpen ? t('landing.nav.close') : t('landing.nav.menu')}
                >
                  {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </span>
            </div>
          </div>

          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                id="landing-mobile-menu"
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="mt-2 rounded-3xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))] p-3 shadow-2xl lg:hidden"
              >
                <nav className="flex flex-col" aria-label="Mobile">
                  {NAV_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => scrollTo(id)}
                      className="rounded-2xl px-4 py-3 text-left font-display text-lg font-semibold hover:bg-[hsl(var(--sv-mist))]"
                    >
                      {t(`landing.nav.${id}`)}
                    </button>
                  ))}
                </nav>
                <div className="mt-2 flex gap-2 border-t border-[hsl(var(--sv-line))] pt-3">
                  <Link to="/auth?tab=signin" className="sv-btn sv-btn--ghost flex-1">
                    {t('landing.nav.login')}
                  </Link>
                  {languageSwitcher}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </header>

      <main>
        {/* Hero */}
        <Section fullBleed className="sv-hero isolate overflow-hidden pt-28 sm:pt-36 pb-16 sm:pb-24">
          <div className="sv-aurora" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          <div className="sv-marketing-grid absolute inset-0 opacity-50" aria-hidden />

          <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-7 flex justify-center"
            >
              <span className="sv-hero-badge max-w-full text-left">
                <span className="sv-hero-badge__dot sv-pulse shrink-0 !px-1.5">
                  <HeartHandshake className="h-3.5 w-3.5" />
                </span>
                {t('landing.hero.badge')}
              </span>
            </motion.div>

            <motion.h1
              initial={reduceMotion ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.08, ease: EASE }}
              className="font-display text-[clamp(2.1rem,5.2vw,4.1rem)] font-bold leading-[1.06] tracking-[-0.04em]"
            >
              <span className="block text-balance">{t('landing.hero.line1')}</span>
              <span className="sv-gradient-text block text-balance pb-[0.1em]">{t('landing.hero.line2')}</span>
            </motion.h1>

            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
              className="sv-lead mx-auto mt-6 max-w-2xl"
            >
              {t('landing.hero.subtitle')}
            </motion.p>

            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
              className="mt-6 inline-flex rounded-full border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))]/80 px-4 py-2 font-display text-sm font-semibold sm:text-base"
              data-testid="landing-hero-price"
            >
              {t('landing.hero.price', OFFER)}
            </motion.p>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <button
                type="button"
                onClick={openRequest}
                data-testid="landing-setup-cta"
                className="sv-btn sv-btn--primary sv-btn--lg w-full sm:w-auto"
              >
                {t('landing.hero.ctaPrimary')}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollTo('included')}
                data-testid="landing-included-cta"
                className="sv-btn sv-btn--ghost sv-btn--lg w-full sm:w-auto"
              >
                {t('landing.hero.ctaSecondary')}
              </button>
            </motion.div>

            <motion.ul
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.45 }}
              className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-[hsl(var(--sv-ink))]/60"
            >
              {highlights.map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-[hsl(var(--sv-accent))]" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </motion.ul>
          </div>

          <div className="relative z-10 mx-auto mt-12 sm:mt-16 max-w-6xl px-4 sm:px-6 lg:px-8">
            <HeroMockup />
          </div>
        </Section>

        {/* One-time assisted setup — placed early so the {{setup}} offer is visible above the fold flow */}
        <Section className="py-16 sm:py-24">{assistedSetupCard}</Section>

        {/* What you get */}
        <Section id="included" className="py-16 sm:py-24">
          <SectionHeading
            reveal={reveal()}
            eyebrow={t('landing.included.eyebrow')}
            title={t('landing.included.title')}
            subtitle={t('landing.included.subtitle', OFFER)}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {included.map((item, i) => {
              const Icon = INCLUDED_ICONS[i] ?? Sparkles;
              return (
                <motion.div
                  key={item.title}
                  {...reveal((i % 3) * 0.06)}
                  // Three cards on the first row, two wider ones on the second.
                  className={cn('flex', i < 3 ? 'lg:col-span-2' : 'lg:col-span-3', i === included.length - 1 && 'sm:col-span-2 lg:col-span-3')}
                >
                  <SpotlightCard className="flex w-full flex-col gap-4 p-5 sm:p-6">
                    <span className="sv-icon-tile">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <div className="space-y-2">
                      <h3 className="font-display text-lg font-bold">{item.title}</h3>
                      <p className="text-sm leading-relaxed text-[hsl(var(--sv-ink))]/60">{item.desc}</p>
                    </div>
                  </SpotlightCard>
                </motion.div>
              );
            })}
          </div>

          <motion.div
            {...reveal(0.05)}
            className="mt-6 grid gap-6 rounded-3xl border border-[hsl(var(--sv-accent))]/25 bg-[hsl(var(--sv-accent))]/[0.06] p-6 sm:p-8 lg:grid-cols-[1fr_1.1fr] lg:items-center"
          >
            <div className="space-y-3">
              <p className="font-display text-xl font-bold">{t('landing.included.trainingTitle')}</p>
              <p className="text-sm leading-relaxed text-[hsl(var(--sv-ink))]/65">{t('landing.included.after', OFFER)}</p>
            </div>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {training.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 rounded-2xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))] px-4 py-3 text-sm font-medium"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--sv-accent))]">
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </Section>

        {/* How it works */}
        <Section id="how-it-works" className="py-16 sm:py-24">
          <SectionHeading
            center
            reveal={reveal()}
            eyebrow={t('landing.how.eyebrow')}
            title={t('landing.how.title')}
            subtitle={t('landing.how.subtitle')}
          />
          <HowItWorks steps={steps} reveal={reveal} />
        </Section>

        {/* Platform features (compact) */}
        <Section id="features" className="py-16 sm:py-24">
          <SectionHeading
            reveal={reveal()}
            eyebrow={t('landing.platform.eyebrow')}
            title={t('landing.platform.title')}
            subtitle={t('landing.platform.subtitle')}
          />

          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {features.map((item, i) => {
              const Icon = FEATURE_ICONS[i] ?? Package;
              return (
                <motion.div key={item.title} {...reveal((i % 4) * 0.05)} className="flex">
                  <SpotlightCard className="flex w-full items-start gap-3 p-4 sm:p-5">
                    <span className="sv-icon-tile !h-10 !w-10 shrink-0">
                      <Icon className="h-[1.1rem] w-[1.1rem]" strokeWidth={1.75} />
                    </span>
                    <span className="space-y-1">
                      <span className="block font-display text-base font-bold">{item.title}</span>
                      <span className="block text-sm leading-snug text-[hsl(var(--sv-ink))]/60">{item.desc}</span>
                    </span>
                  </SpotlightCard>
                </motion.div>
              );
            })}
          </div>

          <motion.div {...reveal(0.05)} className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--sv-ink))]/45">
              {t('landing.trust.label')}
            </p>
            <ul className="flex flex-wrap justify-center gap-2">
              {trust.map((item) => (
                <li
                  key={item.name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))] px-3 py-1.5 text-sm"
                >
                  <span className="font-semibold">{item.name}</span>
                  <span className="text-[hsl(var(--sv-ink))]/55">· {item.role}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </Section>

        {/* People behind the store */}
        <Section className="py-16 sm:py-24">
          <motion.div
            {...reveal()}
            className="sv-card sv-card--featured relative isolate overflow-hidden px-6 py-12 text-center sm:px-12 sm:py-16"
          >
            <div className="sv-glow absolute left-1/2 top-0 -z-10 h-64 w-[36rem] max-w-full -translate-x-1/2 -translate-y-1/3 opacity-60" aria-hidden />
            <div className="mx-auto max-w-2xl space-y-5">
              <span className="sv-icon-tile mx-auto">
                <HeartHandshake className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <p className="sv-eyebrow justify-center">{t('landing.human.eyebrow')}</p>
              <h2 className="sv-h2 text-balance">{t('landing.human.title')}</h2>
              <p className="sv-lead">{t('landing.human.body')}</p>
              <div className="pt-2">
                <button type="button" onClick={openRequest} className="sv-btn sv-btn--ghost">
                  {t('landing.hero.ctaPrimary')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        </Section>

        {/* Pricing */}
        <Section id="pricing" className="py-16 sm:py-24">
          <SectionHeading
            center
            reveal={reveal()}
            eyebrow={t('landing.pricing.eyebrow')}
            title={t('landing.pricing.title')}
            subtitle={t('landing.pricing.subtitle')}
          />

          {/* Recurring subscription */}
          <motion.div {...reveal()} className="mx-auto max-w-2xl space-y-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--sv-ink))]/45">
              {t('landing.pricing.subscriptionLabel')}
            </p>
            <h3 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{t('landing.pricing.subscriptionTitle')}</h3>
            <p className="text-sm sm:text-base leading-relaxed text-[hsl(var(--sv-ink))]/60">
              {t('landing.pricing.subscriptionSubtitle')}
            </p>
          </motion.div>

          <motion.div {...reveal()} className="mb-10 mt-8 flex justify-center">
            <div className="sv-toggle" role="group" aria-label={t('landing.pricing.subscriptionLabel')}>
              {(['monthly', 'yearly'] as const).map((interval) => (
                <button
                  key={interval}
                  type="button"
                  aria-pressed={billing === interval}
                  onClick={() => setBilling(interval)}
                >
                  {billing === interval ? (
                    <motion.span
                      layoutId="billing-pill"
                      className="sv-toggle__pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                  {t(`landing.pricing.${interval}`)}
                  {interval === 'yearly' ? (
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        billing === 'yearly' ? 'bg-white/20' : 'bg-[hsl(var(--sv-good))]/15 text-[hsl(var(--sv-good))]'
                      )}
                    >
                      {t('landing.pricing.twoMonthsFree')}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </motion.div>

          <motion.div {...reveal(0.05)} className="grid items-stretch gap-5 lg:grid-cols-3">
            {SPEEDVENDORS_TIERS.map((tier) => {
              const plan = SPEEDVENDORS_PLANS[tier];
              const price = advertisedPrice(tier, billing);
              return (
                <div
                  key={tier}
                  className={cn(
                    'sv-card flex flex-col p-6 sm:p-8',
                    plan.popular ? 'border-[hsl(var(--sv-accent))]/45' : 'hover:border-[hsl(var(--sv-accent))]/40'
                  )}
                >
                  <div className="mb-5 flex items-center justify-between gap-2">
                    <h4 className="font-display text-xl font-bold">{plan.name}</h4>
                    {plan.popular ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--sv-accent))]/12 px-3 py-1 text-[11px] font-bold text-[hsl(var(--sv-accent))]">
                        <Sparkles className="h-3 w-3" />
                        {t('landing.pricing.mostPopular')}
                      </span>
                    ) : null}
                  </div>

                  <div className="mb-1 flex items-baseline gap-1">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={`${tier}-${billing}`}
                        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
                        transition={{ duration: 0.22 }}
                        className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl"
                      >
                        {price}
                      </motion.span>
                    </AnimatePresence>
                    {billing === 'monthly' ? (
                      <span className="text-sm text-[hsl(var(--sv-ink))]/50">{t('landing.pricing.perMonth')}</span>
                    ) : null}
                  </div>

                  {billing === 'yearly' ? (
                    <div className="mb-5 space-y-1">
                      <p className="text-sm font-semibold text-[hsl(var(--sv-good))]">{t('landing.pricing.twoMonthsFree')}</p>
                      <p className="text-sm text-[hsl(var(--sv-ink))]/55">
                        {t('landing.pricing.monthlyEquivalent', { price: advertisedMonthlyEquivalent(tier) })}
                      </p>
                      <p className="text-sm text-[hsl(var(--sv-ink))]/55">
                        {price} {t('landing.pricing.perYear')}
                      </p>
                    </div>
                  ) : (
                    <p className="mb-5 text-sm text-[hsl(var(--sv-ink))]/55">&nbsp;</p>
                  )}

                  <p className="mb-5 inline-flex w-fit items-center gap-2 rounded-full bg-[hsl(var(--sv-mist))] px-3 py-1.5 text-sm font-medium">
                    <Package className="h-4 w-4 text-[hsl(var(--sv-accent))]" />
                    {t('landing.pricing.storage', { size: plan.mediaQuotaGiB })}
                  </p>

                  <ul className="flex-1 space-y-3">
                    {planList.map((item) => (
                      <li key={`${tier}-${item}`} className="flex gap-3 text-sm text-[hsl(var(--sv-ink))]/75">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--sv-accent))]/12">
                          <Check className="h-3 w-3 text-[hsl(var(--sv-accent))]" strokeWidth={3} />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </motion.div>

          <motion.div
            {...reveal()}
            data-testid="landing-pricing-notes"
            className="mx-auto mt-8 max-w-3xl space-y-2 rounded-2xl border border-dashed border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))]/60 p-5"
          >
            <p className="flex gap-2.5 text-sm leading-relaxed text-[hsl(var(--sv-ink))]/70">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--sv-accent))]" />
              {t('landing.pricing.providersNote')}
            </p>
            <p className="pl-[1.6rem] text-sm leading-relaxed text-[hsl(var(--sv-ink))]/60">
              {t('landing.pricing.notIncluded')}
            </p>
          </motion.div>

          {/* Self-serve alternative: the existing trial flow */}
          <motion.div
            {...reveal()}
            data-testid="landing-pricing-trial"
            className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-4 rounded-3xl border border-[hsl(var(--sv-line))] px-6 py-8 text-center sm:flex-row sm:justify-between sm:text-left"
          >
            <div className="space-y-1">
              <p className="font-display text-lg font-bold">{t('landing.pricing.selfServeTitle')}</p>
              <p className="text-sm text-[hsl(var(--sv-ink))]/60">
                {t('landing.pricing.selfServeBody')} {t('landing.pricing.trialNoCard')}.
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
              <Link
                to="/auth?tab=signup&intent=trial"
                data-testid="landing-trial-cta"
                className="sv-btn sv-btn--ghost w-full sm:w-auto"
              >
                {t('landing.pricing.trialCta')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/auth?tab=signup&intent=subscribe"
                data-testid="landing-choose-plan-cta"
                className="text-center text-sm font-medium text-[hsl(var(--sv-ink))]/60 underline-offset-4 hover:text-[hsl(var(--sv-accent))] hover:underline"
              >
                {t('landing.pricing.choosePlanCta')}
              </Link>
            </div>
          </motion.div>
        </Section>

        {/* FAQ */}
        <Section id="faq" className="py-16 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <motion.div {...reveal()} className="space-y-6 lg:sticky lg:top-28 lg:self-start">
              <h2 className="sv-h2">{t('landing.faq.title')}</h2>
              <div className="rounded-2xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))] p-5">
                <p className="font-display text-lg font-bold">{t('landing.faq.moreTitle')}</p>
                <p className="mt-1 text-sm text-[hsl(var(--sv-ink))]/60">{t('landing.faq.moreBody')}</p>
                <a href="mailto:cosminharbon@icloud.com" className="sv-btn sv-btn--ghost sv-btn--sm mt-4">
                  {t('landing.footer.contact')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </motion.div>
            <motion.div {...reveal(0.05)} className="space-y-3">
              {faqs.map((item, i) => (
                <FaqItem
                  key={item.q}
                  index={i}
                  q={item.q}
                  a={item.a}
                  open={openFaq === i}
                  onToggle={() => setOpenFaq(openFaq === i ? null : i)}
                />
              ))}
            </motion.div>
          </div>
        </Section>

        {/* Final CTA */}
        <Section className="py-16 sm:py-24">
          <motion.div {...reveal()} className="sv-dark sv-panel-dark px-6 py-16 text-center sm:px-12 sm:py-24">
            <div className="sv-aurora" aria-hidden>
              <i />
              <i />
              <i />
            </div>
            <div className="sv-panel-dark__grid" aria-hidden />
            <div className="relative mx-auto max-w-3xl space-y-6">
              <h2 className="font-display text-[clamp(1.9rem,4.4vw,3.4rem)] font-bold leading-[1.08] tracking-[-0.04em] text-balance">
                {t('landing.final.title')}
              </h2>
              <p className="mx-auto max-w-xl text-base sm:text-lg text-white/65">{t('landing.final.subtitle')}</p>
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={openRequest}
                  className="sv-btn sv-btn--white sv-btn--lg w-full sm:w-auto"
                  data-testid="landing-final-cta"
                >
                  {t('landing.final.cta')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        </Section>
      </main>

      {/* Footer */}
      <footer className="relative overflow-hidden border-t border-[hsl(var(--sv-line))] px-4 pt-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <BrandLogo variant="horizontal" imgClassName="h-7 w-auto max-w-[160px]" />
            <p className="max-w-xs text-sm text-[hsl(var(--sv-ink))]/55">{t('landing.footer.tagline')}</p>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--sv-ink))]/40">
              {t('landing.footer.product')}
            </p>
            <ul className="space-y-2 text-sm text-[hsl(var(--sv-ink))]/65">
              {NAV_IDS.map((id) => (
                <li key={id}>
                  <button type="button" onClick={() => scrollTo(id)} className="hover:text-[hsl(var(--sv-accent))]">
                    {t(`landing.nav.${id}`)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--sv-ink))]/40">
              {t('landing.footer.account')}
            </p>
            <ul className="space-y-2 text-sm text-[hsl(var(--sv-ink))]/65">
              <li>
                <Link to="/auth?tab=signin" className="hover:text-[hsl(var(--sv-accent))]">
                  {t('landing.nav.login')}
                </Link>
              </li>
              <li>
                <Link to="/auth?tab=signup" className="hover:text-[hsl(var(--sv-accent))]">
                  {t('landing.nav.createAccount')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--sv-ink))]/40">
              {t('landing.footer.legal')}
            </p>
            <ul className="space-y-2 text-sm text-[hsl(var(--sv-ink))]/65">
              <li>
                <Link to="/privacy" className="hover:text-[hsl(var(--sv-accent))]">
                  {t('landing.footer.privacy')}
                </Link>
              </li>
              <li>
                <a href="mailto:cosminharbon@icloud.com" className="hover:text-[hsl(var(--sv-accent))]">
                  {t('landing.footer.contact')}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-wrap justify-between gap-2 border-t border-[hsl(var(--sv-line))] pt-6 text-xs text-[hsl(var(--sv-ink))]/40">
          <span>© {new Date().getFullYear()} SpeedVendors</span>
          <span>{t('landing.footer.rights')}</span>
        </div>
        <p className="sv-footer-word mt-6 -mb-[0.12em]" aria-hidden>
          SpeedVendors
        </p>
      </footer>

      <SetupRequestDialog open={requestOpen} onOpenChange={setRequestOpen} />
    </div>
  );
}
