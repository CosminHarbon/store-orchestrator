import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  CreditCard,
  FileText,
  Globe,
  Package,
  ShoppingBag,
  Store,
  Truck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { useLanguage } from '@/i18n/LanguageProvider';
import type { AppLanguage } from '@/i18n/types';
import { MARKETING_PRICING, hasPrice } from '@/lib/marketingPricing';
import { cn } from '@/lib/utils';
import '@/styles/marketing.css';

const NAV_IDS = ['features', 'how-it-works', 'pricing', 'faq'] as const;

const FEATURE_ICONS = [
  Package,
  ShoppingBag,
  CreditCard,
  Truck,
  FileText,
  Users,
  BarChart3,
  Store,
] as const;

/** First-party integrations in the product — wordmarks only (no partner logo files in repo). */
const INTEGRATION_NAMES = ['Netopia', 'eAWB', 'Oblio'] as const;

function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn('relative px-4 sm:px-6 lg:px-8', className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function DashboardMock() {
  const { t } = useTranslation('auth');
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))] shadow-[0_40px_80px_-40px_rgba(15,23,42,0.45)]"
      aria-hidden
    >
      <div className="flex items-center gap-2 border-b border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))]/80 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-3 text-xs text-muted-foreground font-medium tracking-wide">
          {t('landing.mock.windowTitle')}
        </span>
      </div>
      <div className="grid grid-cols-[88px_1fr] sm:grid-cols-[120px_1fr] min-h-[240px] sm:min-h-[300px]">
        <div className="border-r border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))] p-3 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={cn(
                'h-7 rounded-md',
                i === 1 ? 'bg-[hsl(var(--sv-accent))]/25' : 'bg-[hsl(var(--sv-mist))]'
              )}
            />
          ))}
        </div>
        <div className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))] p-3"
              >
                <div className="h-2 w-10 rounded bg-[hsl(var(--sv-line))] mb-2" />
                <div className="h-5 w-14 rounded bg-[hsl(var(--sv-accent))]/30" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))] p-3 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-[hsl(var(--sv-mist))]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-[70%] rounded bg-[hsl(var(--sv-line))]" />
                  <div className="h-2 w-[40%] rounded bg-[hsl(var(--sv-line))]/70" />
                </div>
                <div className="h-6 w-14 rounded-full bg-[hsl(var(--sv-accent-soft))]" />
              </div>
            ))}
          </div>
        </div>
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
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');

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

  const featureItems = t('landing.platform.items', { returnObjects: true });
  const howSteps = t('landing.how.steps', { returnObjects: true });
  const faqItems = t('landing.faq.items', { returnObjects: true });
  const included = t('landing.pricing.included', { returnObjects: true });

  if (
    !ready ||
    !Array.isArray(featureItems) ||
    !Array.isArray(howSteps) ||
    !Array.isArray(faqItems) ||
    !Array.isArray(included)
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

  const priceValue =
    billing === 'monthly' ? MARKETING_PRICING.monthly : MARKETING_PRICING.yearly;
  const showPrice = hasPrice(priceValue);

  const fade = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-40px' },
        transition: { duration: 0.45, ease: 'easeOut' },
      };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleLanguage = () => {
    const next: AppLanguage = language === 'en' ? 'ro' : 'en';
    void setLanguage(next);
  };

  return (
    <div className="sv-marketing min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 sv-marketing-glow" aria-hidden />
      <div className="pointer-events-none fixed inset-0 sv-marketing-grid opacity-60" aria-hidden />

      {/* Navbar */}
      <header
        className={cn(
          'sticky top-0 z-50 transition-all duration-300',
          scrolled
            ? 'border-b border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))]/85 backdrop-blur-xl'
            : 'bg-transparent'
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <BrandLogo variant="horizontal" imgClassName="h-8 w-auto max-w-[180px]" />
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[hsl(var(--sv-ink))]/70">
            {NAV_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollTo(id)}
                className="hover:text-[hsl(var(--sv-ink))] transition-colors"
              >
                {t(`landing.nav.${id}`)}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex gap-1.5 text-[hsl(var(--sv-ink))]/70"
              onClick={toggleLanguage}
              aria-label={t('landing.nav.language')}
            >
              <Globe className="h-4 w-4" />
              {language.toUpperCase()}
            </Button>
            <ThemeToggle />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => navigate('/auth?tab=signin')}
            >
              {t('landing.nav.login')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-full bg-[hsl(var(--sv-accent))] text-[hsl(var(--sv-on-accent))] hover:bg-[hsl(var(--sv-accent-deep))]"
              onClick={() => navigate('/auth?tab=signup')}
            >
              {t('landing.nav.getStarted')}
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <Section className="pt-14 pb-20 sm:pt-20 sm:pb-28">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-center">
          <motion.div
            {...(reduceMotion
              ? {}
              : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55 } })}
            className="space-y-7"
          >
            <p className="font-display text-5xl sm:text-6xl lg:text-[4.25rem] font-extrabold leading-[1.02] tracking-tight">
              {t('landing.hero.line1')}
              <br />
              <span className="text-[hsl(var(--sv-accent))]">{t('landing.hero.line2')}</span>
            </p>
            <p className="max-w-xl text-base sm:text-lg text-[hsl(var(--sv-ink))]/65 leading-relaxed">
              {t('landing.hero.subtitle')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                className="rounded-full h-12 px-6 bg-[hsl(var(--sv-accent))] text-[hsl(var(--sv-on-accent))] hover:bg-[hsl(var(--sv-accent-deep))]"
                onClick={() => navigate('/auth?tab=signup')}
              >
                {t('landing.hero.ctaPrimary')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full h-12 px-6 border-[hsl(var(--sv-line))] bg-transparent"
                onClick={() => scrollTo('how-it-works')}
              >
                {t('landing.hero.ctaSecondary')}
              </Button>
            </div>
            <p className="text-sm font-medium text-[hsl(var(--sv-ink))]/55">{t('landing.hero.tagline')}</p>
          </motion.div>

          <motion.div
            {...(reduceMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 28 },
                  animate: { opacity: 1, y: 0 },
                  transition: { duration: 0.6, delay: 0.12 },
                })}
          >
            <DashboardMock />
          </motion.div>
        </div>
      </Section>

      {/* Trust strip — names only; no partner logo files in repo */}
      <Section className="pb-16">
        <motion.div {...fade} className="space-y-5">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--sv-ink))]/45">
            {t('landing.trust.label')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {INTEGRATION_NAMES.map((name) => (
              <span
                key={name}
                className="font-display text-sm sm:text-base font-semibold tracking-tight text-[hsl(var(--sv-ink))]/40"
              >
                {name}
              </span>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* How it works */}
      <Section id="how-it-works" className="py-20 sm:py-24">
        <motion.div {...fade} className="max-w-2xl mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--sv-accent))] mb-3">
            {t('landing.how.eyebrow')}
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            {t('landing.how.title')}
          </h2>
          <p className="mt-3 text-[hsl(var(--sv-ink))]/60 text-base sm:text-lg">{t('landing.how.subtitle')}</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8 relative">
          <div
            className="hidden md:block absolute top-10 left-[16%] right-[16%] h-px bg-[hsl(var(--sv-line))]"
            aria-hidden
          />
          {steps.map((step, i) => (
            <motion.div key={step.title} {...fade} transition={{ delay: i * 0.06 }} className="relative space-y-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))] font-display text-sm font-bold relative z-10">
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="font-display text-xl font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-[hsl(var(--sv-ink))]/60">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Platform features */}
      <Section id="features" className="py-20 sm:py-24">
        <motion.div {...fade} className="max-w-2xl mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--sv-accent))] mb-3">
            {t('landing.platform.eyebrow')}
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            {t('landing.platform.title')}
          </h2>
          <p className="mt-3 text-[hsl(var(--sv-ink))]/60 text-base sm:text-lg">
            {t('landing.platform.subtitle')}
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-line))]">
          {features.map((item, i) => {
            const Icon = FEATURE_ICONS[i] ?? Boxes;
            return (
              <motion.div
                key={item.title}
                {...fade}
                className="bg-[hsl(var(--sv-paper))] p-6 sm:p-7 space-y-3"
              >
                <Icon className="h-5 w-5 text-[hsl(var(--sv-accent))]" strokeWidth={1.75} />
                <h3 className="font-display font-semibold text-base">{item.title}</h3>
                <p className="text-sm text-[hsl(var(--sv-ink))]/55 leading-relaxed">{item.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </Section>

      {/* Ecosystem flow */}
      <Section className="py-20 sm:py-24">
        <motion.div {...fade} className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            {t('landing.ecosystem.title')}
          </h2>
          <p className="mt-3 text-[hsl(var(--sv-ink))]/60">{t('landing.ecosystem.subtitle')}</p>
        </motion.div>
        <motion.div
          {...fade}
          className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-sm font-medium"
        >
          {(
            t('landing.ecosystem.nodes', { returnObjects: true }) as string[]
          ).map((node, i, arr) => (
            <div key={node} className="flex items-center gap-2 sm:gap-3">
              <span className="rounded-full border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))] px-4 py-2">
                {node}
              </span>
              {i < arr.length - 1 && (
                <ArrowRight className="h-4 w-4 text-[hsl(var(--sv-ink))]/30 shrink-0" aria-hidden />
              )}
            </div>
          ))}
        </motion.div>
      </Section>

      {/* We handle the technology */}
      <Section className="py-20 sm:py-24">
        <motion.div
          {...fade}
          className="rounded-3xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))] px-6 py-12 sm:px-12 sm:py-16"
        >
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            <div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                {t('landing.tech.title')}
              </h2>
              <p className="mt-4 text-[hsl(var(--sv-ink))]/60 text-base sm:text-lg leading-relaxed">
                {t('landing.tech.subtitle')}
              </p>
            </div>
            <ul className="space-y-3">
              {(t('landing.tech.points', { returnObjects: true }) as string[]).map((point) => (
                <li key={point} className="flex gap-3 text-sm sm:text-base text-[hsl(var(--sv-ink))]/75">
                  <Check className="h-5 w-5 shrink-0 text-[hsl(var(--sv-accent))] mt-0.5" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </Section>

      {/* Pricing */}
      <Section id="pricing" className="py-20 sm:py-24">
        <motion.div {...fade} className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--sv-accent))] mb-3">
            {t('landing.pricing.eyebrow')}
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            {t('landing.pricing.title')}
          </h2>
          <p className="mt-3 text-[hsl(var(--sv-ink))]/60">{t('landing.pricing.subtitle')}</p>
        </motion.div>

        <motion.div
          {...fade}
          className="mx-auto max-w-lg rounded-3xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))] p-7 sm:p-9 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]"
        >
          <div className="flex items-center justify-between gap-3 mb-6">
            <div>
              <h3 className="font-display text-xl font-bold">{t('landing.pricing.planName')}</h3>
              <p className="text-sm text-[hsl(var(--sv-ink))]/55">{t('landing.pricing.planTag')}</p>
            </div>
            <div className="inline-flex rounded-full border border-[hsl(var(--sv-line))] p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setBilling('monthly')}
                className={cn(
                  'rounded-full px-3 py-1.5 transition-colors',
                  billing === 'monthly'
                    ? 'bg-[hsl(var(--sv-accent))] text-[hsl(var(--sv-on-accent))]'
                    : 'text-[hsl(var(--sv-ink))]/55'
                )}
              >
                {t('landing.pricing.monthly')}
              </button>
              <button
                type="button"
                onClick={() => setBilling('yearly')}
                className={cn(
                  'rounded-full px-3 py-1.5 transition-colors',
                  billing === 'yearly'
                    ? 'bg-[hsl(var(--sv-accent))] text-[hsl(var(--sv-on-accent))]'
                    : 'text-[hsl(var(--sv-ink))]/55'
                )}
              >
                {t('landing.pricing.yearly')}
              </button>
            </div>
          </div>

          <div className="mb-6 min-h-[3.5rem] flex items-end gap-2">
            {showPrice ? (
              <>
                <span className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">
                  {priceValue}
                </span>
                <span className="text-sm text-[hsl(var(--sv-ink))]/50 pb-1.5">
                  {billing === 'monthly'
                    ? t('landing.pricing.perMonth')
                    : t('landing.pricing.perYear')}
                </span>
              </>
            ) : (
              <span className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[hsl(var(--sv-ink))]/45">
                {t('landing.pricing.comingSoon')}
              </span>
            )}
          </div>

          <ul className="space-y-2.5 mb-8">
            {includedList.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm text-[hsl(var(--sv-ink))]/70">
                <Check className="h-4 w-4 shrink-0 text-[hsl(var(--sv-accent))] mt-0.5" />
                {item}
              </li>
            ))}
          </ul>

          <div className="rounded-2xl border border-dashed border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))]/60 p-4 mb-6 space-y-1.5">
            <p className="text-sm font-semibold">{t('landing.pricing.setupTitle')}</p>
            <p className="text-sm text-[hsl(var(--sv-ink))]/60 leading-relaxed">
              {t('landing.pricing.setupBody')}
            </p>
            {hasPrice(MARKETING_PRICING.setupFee) ? (
              <p className="text-sm font-medium pt-1">{MARKETING_PRICING.setupFee}</p>
            ) : (
              <p className="text-xs text-[hsl(var(--sv-ink))]/45 pt-1">{t('landing.pricing.setupFeeTbd')}</p>
            )}
          </div>

          <Button
            size="lg"
            className="w-full rounded-full h-12 bg-[hsl(var(--sv-accent))] text-[hsl(var(--sv-on-accent))] hover:bg-[hsl(var(--sv-accent-deep))]"
            onClick={() => navigate('/auth?tab=signup')}
          >
            {t('landing.pricing.cta')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </motion.div>
      </Section>

      {/* FAQ */}
      <Section id="faq" className="py-20 sm:py-24">
        <motion.div {...fade} className="max-w-2xl mb-10">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            {t('landing.faq.title')}
          </h2>
        </motion.div>
        <div className="max-w-3xl divide-y divide-[hsl(var(--sv-line))] border-y border-[hsl(var(--sv-line))]">
          {faqs.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="cursor-pointer list-none font-display font-semibold text-base sm:text-lg flex items-center justify-between gap-4">
                {item.q}
                <span className="text-[hsl(var(--sv-ink))]/35 group-open:rotate-45 transition-transform text-2xl leading-none">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm sm:text-base text-[hsl(var(--sv-ink))]/60 leading-relaxed pr-8">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <Section className="py-20 sm:py-28">
        <motion.div
          {...fade}
          className="rounded-3xl bg-[hsl(var(--sv-surface-deep))] text-white px-6 py-14 sm:px-12 sm:py-16 text-center"
        >
          <h2 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight">
            {t('landing.final.title')}
          </h2>
          <p className="mt-4 text-base sm:text-lg opacity-70 max-w-xl mx-auto">
            {t('landing.final.subtitle')}
          </p>
          <Button
            size="lg"
            className="mt-8 rounded-full h-12 px-8 bg-[hsl(var(--sv-accent))] text-[hsl(var(--sv-on-accent))] hover:bg-[hsl(var(--sv-accent-deep))]"
            onClick={() => navigate('/auth?tab=signup')}
          >
            {t('landing.final.cta')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </motion.div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-[hsl(var(--sv-line))] px-4 sm:px-6 lg:px-8 py-12">
        <div className="mx-auto max-w-6xl grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BrandLogo variant="horizontal" imgClassName="h-7 w-auto max-w-[160px]" />
            </div>
            <p className="text-sm text-[hsl(var(--sv-ink))]/50 max-w-xs">{t('landing.footer.tagline')}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--sv-ink))]/40 mb-3">
              {t('landing.footer.product')}
            </p>
            <ul className="space-y-2 text-sm text-[hsl(var(--sv-ink))]/65">
              {NAV_IDS.map((id) => (
                <li key={id}>
                  <button type="button" onClick={() => scrollTo(id)} className="hover:text-[hsl(var(--sv-ink))]">
                    {t(`landing.nav.${id}`)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--sv-ink))]/40 mb-3">
              {t('landing.footer.account')}
            </p>
            <ul className="space-y-2 text-sm text-[hsl(var(--sv-ink))]/65">
              <li>
                <button type="button" onClick={() => navigate('/auth?tab=signin')} className="hover:text-[hsl(var(--sv-ink))]">
                  {t('landing.nav.login')}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => navigate('/auth?tab=signup')} className="hover:text-[hsl(var(--sv-ink))]">
                  {t('landing.nav.getStarted')}
                </button>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--sv-ink))]/40 mb-3">
              {t('landing.footer.legal')}
            </p>
            <ul className="space-y-2 text-sm text-[hsl(var(--sv-ink))]/65">
              <li>
                <Link to="/privacy" className="hover:text-[hsl(var(--sv-ink))]">
                  {t('landing.footer.privacy')}
                </Link>
              </li>
              <li>
                <a href="mailto:cosminharbon@icloud.com" className="hover:text-[hsl(var(--sv-ink))]">
                  {t('landing.footer.contact')}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mx-auto max-w-6xl mt-10 pt-6 border-t border-[hsl(var(--sv-line))] text-xs text-[hsl(var(--sv-ink))]/40 flex flex-wrap justify-between gap-2">
          <span>© {new Date().getFullYear()} SpeedVendors</span>
          <span>{t('landing.footer.rights')}</span>
        </div>
      </footer>
    </div>
  );
}
