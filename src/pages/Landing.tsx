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
  Home,
  LayoutDashboard,
  LayoutTemplate,
  MapPin,
  Menu,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Truck,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { CountUp } from '@/components/landing/CountUp';
import { HeroMockup } from '@/components/landing/HeroMockup';
import { SpotlightCard } from '@/components/landing/SpotlightCard';
import { DesignMock, RunMock, SellMock } from '@/components/landing/TourMockups';
import { useLanguage } from '@/i18n/LanguageProvider';
import type { AppLanguage } from '@/i18n/types';
import { advertisedMonthlyEquivalent, advertisedPrice, hasPrice, MARKETING_PRICING } from '@/lib/marketingPricing';
import { SPEEDVENDORS_PLANS, SPEEDVENDORS_TIERS } from '@/lib/plans/catalogue';
import { cn } from '@/lib/utils';
import '@/styles/marketing.css';

const NAV_IDS = ['features', 'how-it-works', 'pricing', 'faq'] as const;
type NavId = (typeof NAV_IDS)[number];

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const FEATURE_ICONS = [
  LayoutTemplate,
  Package,
  Warehouse,
  ShoppingBag,
  CreditCard,
  Truck,
  FileText,
  Users,
  Star,
  BarChart3,
] as const;

/** Bento layout: the wide cards are Website (0) and Shipping (5) — together each row sums to four columns. */
const BENTO_SPAN = [
  'sm:col-span-2 lg:col-span-2',
  '',
  '',
  '',
  '',
  'sm:col-span-2 lg:col-span-2',
  '',
  '',
  '',
  '',
] as const;

const TOUR_ICONS = [Store, ShoppingBag, LayoutDashboard] as const;
const TOUR_MOCKS = [DesignMock, SellMock, RunMock] as const;
const TRUST_ICONS = [CreditCard, Truck, FileText] as const;
const FLOW_ICONS = [Users, Store, LayoutDashboard, CreditCard, Truck, FileText] as const;

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

function ShippingVisual() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative flex h-16 items-center" aria-hidden>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))] text-[hsl(var(--sv-ink))]/60">
        <Home className="h-4 w-4" />
      </span>
      <span className="relative mx-2 h-px flex-1 border-t-2 border-dashed border-[hsl(var(--sv-line))]">
        <motion.span
          className="absolute -top-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--sv-accent))] text-white shadow-[0_8px_18px_-6px_hsl(var(--sv-accent))]"
          initial={{ left: '0%' }}
          animate={reduceMotion ? { left: '50%' } : { left: ['0%', '92%', '0%'] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Truck className="h-3.5 w-3.5" />
        </motion.span>
      </span>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--sv-accent))]/40 bg-[hsl(var(--sv-accent))]/10 text-[hsl(var(--sv-accent))]">
        <MapPin className="h-4 w-4" />
      </span>
    </div>
  );
}

function WebsiteVisual() {
  return (
    <div className="grid h-24 grid-cols-[1.4fr_1fr] gap-2" aria-hidden>
      <div className="rounded-xl bg-gradient-to-br from-[hsl(var(--sv-accent))] via-[hsl(var(--sv-pink))] to-[hsl(var(--sv-cyan))] p-3">
        <div className="h-2 w-2/3 rounded-full bg-white/90" />
        <div className="mt-2 h-2 w-1/3 rounded-full bg-white/60" />
        <div className="mt-3 h-4 w-14 rounded-full bg-white" />
      </div>
      <div className="grid grid-rows-2 gap-2">
        <div className="sv-mock-tile" />
        <div className="sv-mock-tile" />
      </div>
    </div>
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
  const [tab, setTab] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const { scrollYProgress } = useScroll();
  const barScale = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.25 });

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      navigate('/welcome', { replace: true });
    }
  }, [navigate]);

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

  const featureItems = t('landing.platform.items', { returnObjects: true });
  const howSteps = t('landing.how.steps', { returnObjects: true });
  const faqItems = t('landing.faq.items', { returnObjects: true });
  const included = t('landing.pricing.included', { returnObjects: true });
  const showcasePanels = t('landing.showcase.panels', { returnObjects: true });
  const showcaseTabs = t('landing.showcase.tabs', { returnObjects: true });
  const trustItems = t('landing.trust.items', { returnObjects: true });
  const statItems = t('landing.stats.items', { returnObjects: true });
  const flowNodes = t('landing.ecosystem.nodes', { returnObjects: true });
  const techPoints = t('landing.tech.points', { returnObjects: true });

  if (
    !ready ||
    !Array.isArray(featureItems) ||
    !Array.isArray(howSteps) ||
    !Array.isArray(faqItems) ||
    !Array.isArray(included) ||
    !Array.isArray(showcasePanels) ||
    !Array.isArray(showcaseTabs) ||
    !Array.isArray(trustItems) ||
    !Array.isArray(statItems) ||
    !Array.isArray(flowNodes) ||
    !Array.isArray(techPoints)
  ) {
    return (
      <div className="sv-marketing min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-[hsl(var(--sv-accent))] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const features = featureItems as { title: string; desc: string }[];
  const steps = howSteps as { title: string; desc: string }[];
  const faqs = faqItems as { q: string; a: string }[];
  const includedList = included as string[];
  const panels = showcasePanels as { title: string; body: string; items: string[] }[];
  const tabs = showcaseTabs as string[];
  const trust = trustItems as { name: string; role: string }[];
  const stats = statItems as { value: number; label: string }[];
  const nodes = flowNodes as string[];
  const points = techPoints as string[];

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

  const toggleLanguage = () => {
    const next: AppLanguage = language === 'en' ? 'ro' : 'en';
    void setLanguage(next);
  };

  const ActiveMock = TOUR_MOCKS[tab] ?? DesignMock;
  const activePanel = panels[tab] ?? panels[0];

  const marqueeItems = features.map((item, i) => ({ ...item, Icon: FEATURE_ICONS[i] ?? Store }));

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

            <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
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
              <span className="hidden sm:inline-flex">
                <button
                  type="button"
                  className="sv-btn sv-btn--plain sv-btn--sm"
                  onClick={toggleLanguage}
                  aria-label={t('landing.nav.language')}
                >
                  <Globe className="h-4 w-4" />
                  {language.toUpperCase()}
                </button>
              </span>
              <ThemeToggle />
              <span className="hidden sm:inline-flex">
                <Link to="/auth?tab=signin" className="sv-btn sv-btn--plain sv-btn--sm">
                  {t('landing.nav.login')}
                </Link>
              </span>
              <Link to="/auth?tab=signup" className="sv-btn sv-btn--primary sv-btn--sm">
                {t('landing.nav.getStarted')}
              </Link>
              <span className="inline-flex md:hidden">
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
                className="mt-2 rounded-3xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))] p-3 shadow-2xl md:hidden"
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
                  <button type="button" onClick={toggleLanguage} className="sv-btn sv-btn--ghost" aria-label={t('landing.nav.language')}>
                    <Globe className="h-4 w-4" />
                    {language.toUpperCase()}
                  </button>
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
              <span className="sv-hero-badge" data-testid="landing-trial-nocard">
                <span className="sv-hero-badge__dot sv-pulse">
                  <Sparkles className="mr-1 h-3 w-3" />
                  {t('landing.hero.badgeTag')}
                </span>
                {t('landing.pricing.trialNoCard')}
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

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
              className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Link
                to="/auth?tab=signup&intent=trial"
                data-testid="landing-trial-cta"
                className="sv-btn sv-btn--primary sv-btn--lg w-full sm:w-auto"
              >
                {t('landing.pricing.trialCta')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/auth?tab=signup&intent=subscribe"
                data-testid="landing-choose-plan-cta"
                className="sv-btn sv-btn--ghost sv-btn--lg w-full sm:w-auto"
              >
                {t('landing.pricing.choosePlanCta')}
              </Link>
            </motion.div>

            <motion.button
              type="button"
              onClick={() => scrollTo('how-it-works')}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="mt-6 text-sm font-medium text-[hsl(var(--sv-ink))]/55 underline-offset-4 transition-colors hover:text-[hsl(var(--sv-accent))] hover:underline"
            >
              {t('landing.hero.scroll')} ↓
            </motion.button>
          </div>

          <div className="relative z-10 mx-auto mt-12 sm:mt-16 max-w-6xl px-4 sm:px-6 lg:px-8">
            <HeroMockup />
          </div>
        </Section>

        {/* Integrations */}
        <Section className="pb-8 pt-6 sm:pt-10">
          <motion.div {...reveal()} className="space-y-6">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--sv-ink))]/45">
              {t('landing.trust.label')}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {trust.map((item, i) => {
                const Icon = TRUST_ICONS[i] ?? CreditCard;
                return (
                  <SpotlightCard key={item.name} className="flex items-center gap-4 p-4 sm:p-5">
                    <span className="sv-icon-tile">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span>
                      <span className="block font-display text-lg font-bold leading-tight">{item.name}</span>
                      <span className="block text-sm text-[hsl(var(--sv-ink))]/55">{item.role}</span>
                    </span>
                  </SpotlightCard>
                );
              })}
            </div>
          </motion.div>
        </Section>

        {/* Stats */}
        <Section className="py-16 sm:py-20">
          <motion.dl
            {...reveal()}
            className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-line))] lg:grid-cols-4"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col bg-[hsl(var(--sv-paper))] px-5 py-7 text-center sm:py-9">
                <dt className="order-2 mt-2 text-xs sm:text-sm font-medium text-[hsl(var(--sv-ink))]/55">{stat.label}</dt>
                <dd className="font-display text-5xl sm:text-6xl font-extrabold leading-none tracking-tight">
                  <CountUp to={stat.value} className="sv-gradient-text" />
                </dd>
              </div>
            ))}
          </motion.dl>
        </Section>

        {/* Capability tour */}
        <Section id="features" className="py-16 sm:py-24">
          <SectionHeading
            reveal={reveal()}
            eyebrow={t('landing.showcase.eyebrow')}
            title={t('landing.showcase.title')}
            subtitle={t('landing.showcase.subtitle')}
          />

          <motion.div {...reveal(0.05)}>
            <div
              role="tablist"
              aria-label={t('landing.showcase.title')}
              className="relative mb-8 inline-flex rounded-full border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))] p-1"
            >
              {tabs.map((label, i) => {
                const Icon = TOUR_ICONS[i] ?? Store;
                const selected = tab === i;
                return (
                  <button
                    key={label}
                    role="tab"
                    id={`tour-tab-${i}`}
                    aria-selected={selected}
                    aria-controls="tour-panel"
                    type="button"
                    onClick={() => setTab(i)}
                    className={cn(
                      'relative z-10 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors sm:px-6',
                      selected ? 'text-white' : 'text-[hsl(var(--sv-ink))]/60 hover:text-[hsl(var(--sv-ink))]'
                    )}
                  >
                    {selected ? (
                      <motion.span
                        layoutId="tour-pill"
                        className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-[hsl(var(--sv-accent))] to-[hsl(var(--sv-accent-deep))] shadow-[0_10px_24px_-10px_hsl(var(--sv-accent))]"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    ) : null}
                    <Icon className="h-4 w-4" strokeWidth={2} />
                    {label}
                  </button>
                );
              })}
            </div>

            <div
              id="tour-panel"
              role="tabpanel"
              aria-labelledby={`tour-tab-${tab}`}
              className="grid items-center gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`text-${tab}`}
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-5"
                >
                  <h3 className="font-display text-2xl sm:text-4xl font-bold leading-tight tracking-tight">
                    {activePanel.title}
                  </h3>
                  <p className="sv-lead">{activePanel.body}</p>
                  <ul className="flex flex-wrap gap-2 pt-1">
                    {activePanel.items.map((item) => (
                      <li
                        key={item}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))] px-3 py-1.5 text-sm text-[hsl(var(--sv-ink))]/75"
                      >
                        <Check className="h-3.5 w-3.5 text-[hsl(var(--sv-accent))]" strokeWidth={2.5} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>

              <div className="relative">
                <div className="sv-glow absolute -inset-6 -z-10 opacity-70" aria-hidden />
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`mock-${tab}`}
                    initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -12, scale: 0.98 }}
                    transition={{ duration: 0.35, ease: EASE }}
                  >
                    <ActiveMock />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </Section>

        {/* Module ticker */}
        <div className="sv-marquee py-6" aria-hidden>
          <div className="sv-marquee__track">
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex shrink-0 items-center gap-3 pr-3">
                {marqueeItems.map(({ title, Icon }) => (
                  <li
                    key={`${copy}-${title}`}
                    className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))] px-4 py-2 text-sm font-semibold text-[hsl(var(--sv-ink))]/70"
                  >
                    <Icon className="h-4 w-4 text-[hsl(var(--sv-accent))]" strokeWidth={1.9} />
                    {title}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        {/* Platform bento */}
        <Section className="py-16 sm:py-24">
          <SectionHeading
            reveal={reveal()}
            eyebrow={t('landing.platform.eyebrow')}
            title={t('landing.platform.title')}
            subtitle={t('landing.platform.subtitle')}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((item, i) => {
              const Icon = FEATURE_ICONS[i] ?? Store;
              const wide = Boolean(BENTO_SPAN[i]);
              return (
                <motion.div key={item.title} {...reveal((i % 4) * 0.06)} className={cn('flex', BENTO_SPAN[i])}>
                  <SpotlightCard className="flex w-full flex-col justify-between gap-6 p-5 sm:p-6">
                    {!wide ? (
                      <span className="absolute right-5 top-4 font-display text-sm font-bold text-[hsl(var(--sv-ink))]/15">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    ) : null}
                    {i === 0 ? <WebsiteVisual /> : i === 5 ? <ShippingVisual /> : null}
                    <div className={cn('space-y-3', wide ? '' : 'pt-2')}>
                      {!wide ? (
                        <span className="sv-icon-tile">
                          <Icon className="h-5 w-5" strokeWidth={1.75} />
                        </span>
                      ) : null}
                      <h3 className="font-display text-lg font-bold">{item.title}</h3>
                      <p className="text-sm leading-relaxed text-[hsl(var(--sv-ink))]/60">{item.desc}</p>
                    </div>
                  </SpotlightCard>
                </motion.div>
              );
            })}
          </div>
        </Section>

        {/* Ecosystem flow */}
        <Section className="py-16 sm:py-24">
          <SectionHeading
            center
            reveal={reveal()}
            title={t('landing.ecosystem.title')}
            subtitle={t('landing.ecosystem.subtitle')}
          />
          <motion.ol {...reveal(0.05)} className="relative grid grid-cols-3 gap-y-10 lg:grid-cols-6">
            <span className="sv-pipe-line hidden lg:block" aria-hidden />
            {nodes.map((node, i) => {
              const Icon = FLOW_ICONS[i] ?? Store;
              return (
                <li key={node} className="sv-pipe-item relative flex flex-col items-center gap-3 text-center">
                  <span className="sv-pipe-node">
                    <Icon className="h-6 w-6" strokeWidth={1.7} />
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--sv-paper))] border border-[hsl(var(--sv-line))] text-[10px] font-bold text-[hsl(var(--sv-ink))]/60">
                      {i + 1}
                    </span>
                  </span>
                  <span className="text-sm font-semibold">{node}</span>
                </li>
              );
            })}
          </motion.ol>
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

        {/* We handle the technology */}
        <Section className="py-16 sm:py-24">
          <motion.div {...reveal()} className="sv-dark sv-panel-dark px-6 py-12 sm:px-12 sm:py-16">
            <div className="sv-aurora" aria-hidden>
              <i />
              <i />
              <i />
            </div>
            <div className="sv-panel-dark__grid" aria-hidden />
            <div className="relative grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className="space-y-5">
                <h2 className="sv-h2 !text-[clamp(1.75rem,3.6vw,2.75rem)]">{t('landing.tech.title')}</h2>
                <p className="text-base sm:text-lg leading-relaxed text-white/65">{t('landing.tech.subtitle')}</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {points.map((point, i) => (
                  <motion.li
                    key={point}
                    {...reveal(0.05 * i)}
                    className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-sm text-white/85"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--sv-accent))]">
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </span>
                    {point}
                  </motion.li>
                ))}
              </ul>
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

          <motion.div {...reveal()} className="mb-12 flex justify-center">
            <div className="sv-toggle" role="group" aria-label={t('landing.pricing.title')}>
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
                    plan.popular ? 'sv-card--featured lg:-my-4 lg:py-12' : 'hover:border-[hsl(var(--sv-accent))]/40'
                  )}
                >
                  <div className="mb-5 flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl font-bold">{plan.name}</h3>
                    {plan.popular ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[hsl(var(--sv-accent))] to-[hsl(var(--sv-pink))] px-3 py-1 text-[11px] font-bold text-white">
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
                        className="font-display text-5xl font-extrabold tracking-tight"
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

                  <ul className="mb-8 flex-1 space-y-3">
                    {includedList.map((item) => (
                      <li key={`${tier}-${item}`} className="flex gap-3 text-sm text-[hsl(var(--sv-ink))]/75">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--sv-accent))]/12">
                          <Check className="h-3 w-3 text-[hsl(var(--sv-accent))]" strokeWidth={3} />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/auth?tab=signup&intent=subscribe"
                    className={cn('sv-btn w-full', plan.popular ? 'sv-btn--primary' : 'sv-btn--ghost')}
                  >
                    {t('landing.pricing.choosePlanCta')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </motion.div>

          <motion.div
            {...reveal()}
            data-testid="landing-pricing-trial"
            className="mx-auto mt-14 flex max-w-3xl flex-col items-center gap-4 rounded-3xl border border-[hsl(var(--sv-accent))]/25 bg-[hsl(var(--sv-accent))]/[0.06] px-6 py-8 text-center"
          >
            <p className="font-display text-xl font-bold">{t('landing.pricing.trialEyebrow')}</p>
            <p className="text-sm text-[hsl(var(--sv-ink))]/60">{t('landing.pricing.trialNoCard')}</p>
            <Link to="/auth?tab=signup&intent=trial" className="sv-btn sv-btn--primary">
              {t('landing.pricing.trialCta')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>

          <motion.div
            {...reveal()}
            className="mx-auto mt-6 max-w-3xl space-y-1.5 rounded-2xl border border-dashed border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))]/60 p-5"
          >
            <p className="text-sm font-semibold">{t('landing.pricing.setupTitle')}</p>
            <p className="text-sm leading-relaxed text-[hsl(var(--sv-ink))]/60">{t('landing.pricing.setupBody')}</p>
            {hasPrice(MARKETING_PRICING.setupFee) ? (
              <p className="pt-1 text-sm font-medium">{MARKETING_PRICING.setupFee}</p>
            ) : (
              <p className="pt-1 text-xs text-[hsl(var(--sv-ink))]/45">{t('landing.pricing.setupFeeTbd')}</p>
            )}
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
              <span className="sv-hero-badge !text-white/85 !border-white/15 !bg-white/[0.06]">
                <span className="sv-hero-badge__dot">
                  <Sparkles className="mr-1 h-3 w-3" />
                  {t('landing.final.badgeTag')}
                </span>
                {t('landing.final.badgeText')}
              </span>
              <h2 className="font-display text-[clamp(1.9rem,4.4vw,3.4rem)] font-bold leading-[1.08] tracking-[-0.04em]">
                {t('landing.final.title')}
              </h2>
              <p className="mx-auto max-w-xl text-base sm:text-lg text-white/65">{t('landing.final.subtitle')}</p>
              <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
                <Link to="/auth?tab=signup&intent=trial" className="sv-btn sv-btn--white sv-btn--lg w-full sm:w-auto">
                  {t('landing.final.cta')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/auth?tab=signup&intent=subscribe"
                  className="sv-btn sv-btn--ghost sv-btn--lg w-full sm:w-auto"
                >
                  {t('landing.pricing.choosePlanCta')}
                </Link>
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
                  {t('landing.nav.getStarted')}
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
    </div>
  );
}
