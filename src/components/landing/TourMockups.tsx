import { memo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, FileText, GripVertical, MapPin, ShoppingBag, Star, Truck, CreditCard, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MockWindow } from './MockWindow';

const TEMPLATE_HUES = [255, 158, 18] as const;
const BAR_HEIGHTS = [38, 52, 44, 68, 60, 82, 96] as const;
const TOP_SHARES = [92, 71, 48] as const;

/** Design tab — a storefront the visitor can re-skin by picking a template. */
function DesignMockImpl() {
  const { t } = useTranslation('auth');
  const [active, setActive] = useState(0);
  const templates = t('landing.showcase.tour.design.templates', { returnObjects: true }) as string[];
  const sections = t('landing.showcase.tour.design.sectionList', { returnObjects: true }) as string[];

  return (
    <MockWindow title={t('landing.showcase.tour.design.hint')}>
      <div className="grid md:grid-cols-[11.5rem_1fr]">
        <div className="space-y-4 border-b md:border-b-0 md:border-r border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))]/60 p-4">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--sv-ink))]/45">
              {t('landing.showcase.tour.design.pick')}
            </p>
            <div className="flex md:flex-col gap-2">
              {templates.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-pressed={active === i}
                  className={cn(
                    'flex flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-semibold transition-all',
                    active === i
                      ? 'border-[hsl(var(--sv-accent))] bg-[hsl(var(--sv-paper))] shadow-[0_8px_20px_-12px_hsl(var(--sv-accent))]'
                      : 'border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))]/60 text-[hsl(var(--sv-ink))]/65 hover:border-[hsl(var(--sv-accent))]/50'
                  )}
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full"
                    style={{ background: `linear-gradient(135deg, hsl(${TEMPLATE_HUES[i]} 90% 58%), hsl(${TEMPLATE_HUES[i] + 45} 92% 66%))` }}
                  />
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="hidden md:block">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--sv-ink))]/45">
              {t('landing.showcase.tour.design.sections')}
            </p>
            <ul className="space-y-1.5">
              {sections.map((label) => (
                <li
                  key={label}
                  className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))] px-2 py-1.5 text-[11px] font-medium text-[hsl(var(--sv-ink))]/70"
                >
                  <GripVertical className="h-3 w-3 shrink-0 text-[hsl(var(--sv-ink))]/30" />
                  <span className="truncate">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="sv-sf p-4 sm:p-5" style={{ '--h': TEMPLATE_HUES[active] } as CSSProperties} aria-hidden>
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="sv-sf__btn h-5 w-5 rounded-md" />
              <span className="sv-skeleton h-2 w-14" />
            </span>
            <span className="hidden sm:flex items-center gap-2">
              <span className="sv-skeleton h-2 w-9" />
              <span className="sv-skeleton h-2 w-9" />
              <span className="sv-skeleton h-2 w-9" />
              <ShoppingBag className="h-4 w-4 text-[hsl(var(--sv-ink))]/50" />
            </span>
          </div>
          <div className="sv-sf__hero relative overflow-hidden rounded-2xl p-5 sm:p-7 text-white">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
            <div className="relative space-y-2.5">
              <div className="h-3.5 w-3/5 rounded-full bg-white/90" />
              <div className="h-3.5 w-2/5 rounded-full bg-white/90" />
              <div className="h-2 w-1/2 rounded-full bg-white/50" />
              <div className="mt-3 inline-block rounded-full bg-white px-4 py-1.5">
                <div className="h-2 w-12 rounded-full bg-[hsl(263_53%_10%)]/80" />
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="sv-mock-tile overflow-hidden p-1.5">
                <div className="sv-sf__thumb aspect-[4/3] rounded-lg" />
                <div className="mt-2 space-y-1.5 px-0.5 pb-1">
                  <div className="sv-skeleton h-1.5 w-4/5" />
                  <div className="flex items-center justify-between">
                    <div className="sv-skeleton h-1.5 w-1/3" />
                    <span className="sv-sf__btn h-3.5 w-3.5 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockWindow>
  );
}

function Choice({
  selected,
  onClick,
  icon: Icon,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof Home;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all',
        selected
          ? 'border-[hsl(var(--sv-accent))] bg-[hsl(var(--sv-accent))]/10 text-[hsl(var(--sv-accent))]'
          : 'border-[hsl(var(--sv-line))] text-[hsl(var(--sv-ink))]/60 hover:border-[hsl(var(--sv-accent))]/50'
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

/** Sell tab — checkout pipeline with the choices a shopper actually makes. */
function SellMockImpl() {
  const { t } = useTranslation('auth');
  const reduceMotion = useReducedMotion();
  const [pay, setPay] = useState<'card' | 'cod'>('card');
  const [ship, setShip] = useState<'home' | 'locker'>('locker');
  const s = (key: string) => t(`landing.showcase.tour.sell.${key}`);

  const steps = [
    {
      icon: ShoppingBag,
      title: s('cart'),
      body: <span className="text-[11px] text-[hsl(var(--sv-ink))]/55">{s('cartMeta')}</span>,
    },
    {
      icon: CreditCard,
      title: s('payment'),
      body: (
        <div className="flex flex-wrap gap-1.5">
          <Choice selected={pay === 'card'} onClick={() => setPay('card')} icon={CreditCard} label={s('card')} />
          <Choice selected={pay === 'cod'} onClick={() => setPay('cod')} icon={Check} label={s('cod')} />
        </div>
      ),
    },
    {
      icon: Truck,
      title: s('shipping'),
      body: (
        <div className="flex flex-wrap gap-1.5">
          <Choice selected={ship === 'home'} onClick={() => setShip('home')} icon={Home} label={s('home')} />
          <Choice selected={ship === 'locker'} onClick={() => setShip('locker')} icon={MapPin} label={s('locker')} />
        </div>
      ),
    },
    {
      icon: FileText,
      title: s('invoice'),
      body: (
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-[hsl(var(--sv-ink))]/55">{s('invoiceMeta')}</span>
          <span className="sv-chip-status sv-chip-status--good">{s('issued')}</span>
        </span>
      ),
    },
  ];

  return (
    <MockWindow title="SpeedVendors · Checkout">
      <ol className="relative space-y-3 p-4 sm:p-6">
        <span className="absolute bottom-10 left-[2.15rem] sm:left-[2.9rem] top-10 w-px bg-[hsl(var(--sv-line))]" aria-hidden />
        {steps.map((step, i) => (
          <motion.li
            key={step.title}
            className="relative flex items-center gap-3 sm:gap-4"
            initial={reduceMotion ? false : { opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.16, duration: 0.45 }}
          >
            <span className="relative z-10 flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-paper))] text-[hsl(var(--sv-accent))]">
              <step.icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.9} />
            </span>
            <span className="sv-mock-tile flex flex-1 items-center justify-between gap-3 px-3.5 py-2.5 sm:py-3">
              <span className="min-w-0 space-y-1">
                <span className="block text-xs sm:text-sm font-semibold">{step.title}</span>
                {step.body}
              </span>
              <motion.span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--sv-good))] text-white"
                initial={reduceMotion ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5 + i * 0.22, type: 'spring', stiffness: 380, damping: 18 }}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </motion.span>
            </span>
          </motion.li>
        ))}
      </ol>
    </MockWindow>
  );
}

/** Run tab — a trimmed analytics view: weekly bars, top products, rating. */
function RunMockImpl() {
  const { t } = useTranslation('auth');
  const reduceMotion = useReducedMotion();
  const r = (key: string) => t(`landing.showcase.tour.run.${key}`);
  const products = t('landing.showcase.tour.run.products', { returnObjects: true }) as string[];

  return (
    <MockWindow title={t('landing.mock.windowTitle')}>
      <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-[1.4fr_1fr]" aria-hidden>
        <div className="sv-mock-tile p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold">{r('revenue')}</span>
            <span className="text-[10px] font-medium text-[hsl(var(--sv-ink))]/45">{r('week')}</span>
          </div>
          <div className="flex h-32 sm:h-40 items-end gap-2">
            {BAR_HEIGHTS.map((h, i) => (
              <motion.div
                key={i}
                className="flex-1 rounded-t-lg"
                style={{
                  background:
                    i === BAR_HEIGHTS.length - 1
                      ? 'linear-gradient(180deg, hsl(var(--sv-pink)), hsl(var(--sv-accent)))'
                      : 'linear-gradient(180deg, hsl(var(--sv-accent) / 0.75), hsl(var(--sv-accent) / 0.25))',
                }}
                initial={reduceMotion ? { height: `${h}%` } : { height: 0 }}
                whileInView={{ height: `${h}%` }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="sv-mock-tile p-4">
            <p className="mb-2.5 text-xs font-semibold">{r('top')}</p>
            <ul className="space-y-2.5">
              {products.map((name, i) => (
                <li key={name}>
                  <div className="mb-1 flex justify-between text-[11px] font-medium">
                    <span className="truncate">{name}</span>
                    <span className="text-[hsl(var(--sv-ink))]/45">{TOP_SHARES[i]}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[hsl(var(--sv-line))]">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--sv-accent))] to-[hsl(var(--sv-cyan))]"
                      initial={reduceMotion ? { width: `${TOP_SHARES[i]}%` } : { width: 0 }}
                      whileInView={{ width: `${TOP_SHARES[i]}%` }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + i * 0.12, duration: 0.8 }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="sv-mock-tile flex items-center justify-between p-4">
            <span className="text-xs font-semibold">{r('reviews')}</span>
            <span className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-[hsl(var(--sv-warn))] text-[hsl(var(--sv-warn))]" />
              ))}
              <span className="ml-1 text-xs font-bold">4.8</span>
            </span>
          </div>
        </div>
      </div>
    </MockWindow>
  );
}
export const DesignMock = memo(DesignMockImpl);
export const SellMock = memo(SellMockImpl);
export const RunMock = memo(RunMockImpl);
