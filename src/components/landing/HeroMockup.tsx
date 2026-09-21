import { memo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Truck,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from './CountUp';
import { MockWindow } from './MockWindow';

const SIDEBAR_ICONS = [LayoutDashboard, ShoppingBag, Package, Users, BarChart3] as const;

const CHART_LINE =
  'M0,88 C24,84 40,70 64,72 S104,50 128,54 S168,30 192,36 S236,18 256,22 S300,8 320,6';
const CHART_AREA = `${CHART_LINE} L320,110 L0,110 Z`;

const ORDERS = [
  { id: '#1042', who: 'Ana M.', amount: 249, status: 'paid' },
  { id: '#1041', who: 'Radu I.', amount: 118, status: 'shipped' },
  { id: '#1040', who: 'Elena S.', amount: 89, status: 'processing' },
] as const;

const STATUS_STYLE = {
  paid: 'sv-chip-status--good',
  shipped: 'sv-chip-status--accent',
  processing: 'sv-chip-status--warn',
} as const;

function Notification({
  icon: Icon,
  title,
  meta,
  tone,
  className,
  delay,
  floatClass,
}: {
  icon: typeof Truck;
  title: string;
  meta: string;
  tone: string;
  className: string;
  delay: number;
  floatClass: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={cn('sv-notif hidden md:flex', className)}
      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={cn('flex items-center gap-3', floatClass)}>
        <span className="sv-notif__icon" style={{ background: tone }}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold leading-tight">{title}</span>
          <span className="block text-[11px] text-[hsl(var(--sv-ink))]/55 leading-tight mt-0.5">{meta}</span>
        </span>
      </div>
    </motion.div>
  );
}

/** Illustrative SpeedVendors dashboard with floating event notifications. Flattens as you scroll. */
function HeroMockupImpl() {
  const { t, i18n } = useTranslation('auth');
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 92%', 'start 28%'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.4 });
  const rotateX = useTransform(smooth, [0, 1], [16, 0]);
  const scale = useTransform(smooth, [0, 1], [0.94, 1]);

  const num = (n: number) => n.toLocaleString(i18n.language);
  const currency = t('landing.mock.currency');

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-5xl" style={{ perspective: 1400 }}>
      <div className="sv-glow absolute -inset-x-[4%] -bottom-6 top-1/4 -z-10" aria-hidden />

      <Notification
        icon={ShoppingBag}
        title={t('landing.mock.notifOrder')}
        meta={t('landing.mock.notifOrderMeta')}
        tone="linear-gradient(135deg, hsl(152 62% 42%), hsl(170 70% 38%))"
        className="-right-2 lg:-right-10 -top-7"
        delay={0.9}
        floatClass="sv-float"
      />
      <Notification
        icon={Truck}
        title={t('landing.mock.notifShip')}
        meta={t('landing.mock.notifShipMeta')}
        tone="linear-gradient(135deg, hsl(255 100% 62%), hsl(232 90% 58%))"
        className="-right-3 lg:-right-14 bottom-3"
        delay={1.15}
        floatClass="sv-float sv-float--b"
      />
      <Notification
        icon={FileText}
        title={t('landing.mock.notifInvoice')}
        meta={t('landing.mock.notifInvoiceMeta')}
        tone="linear-gradient(135deg, hsl(322 90% 62%), hsl(340 85% 58%))"
        className="-left-3 lg:-left-20 bottom-24"
        delay={1.4}
        floatClass="sv-float sv-float--c"
      />

      <motion.div
        role="img"
        aria-label={t('landing.mock.illustrative')}
        className="sv-gpu"
        style={reduceMotion ? undefined : { rotateX, scale, transformOrigin: '50% 0%' }}
      >
        <MockWindow title={t('landing.mock.windowTitle')}>
          <div className="flex" aria-hidden>
            {/* Sidebar */}
            <div className="hidden sm:flex w-14 shrink-0 flex-col items-center gap-2 border-r border-[hsl(var(--sv-line))] bg-[hsl(var(--sv-mist))]/60 py-4">
              {SIDEBAR_ICONS.map((Icon, i) => (
                <span
                  key={i}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl',
                    i === 0
                      ? 'bg-[hsl(var(--sv-accent))] text-white shadow-[0_8px_18px_-8px_hsl(var(--sv-accent))]'
                      : 'text-[hsl(var(--sv-ink))]/40'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
              ))}
            </div>

            {/* Main */}
            <div className="min-w-0 flex-1 space-y-3 p-3 sm:p-5">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { label: t('landing.mock.revenue'), to: 12480, delta: '+18%', money: true },
                  { label: t('landing.mock.orders'), to: 186, delta: '+12%', money: false },
                  { label: t('landing.mock.avgOrder'), to: 67, delta: '+4%', money: true },
                ].map((kpi) => (
                  <div key={kpi.label} className="sv-mock-tile p-2.5 sm:p-3.5">
                    <p className="truncate text-[10px] sm:text-xs font-medium text-[hsl(var(--sv-ink))]/50">
                      {kpi.label}
                    </p>
                    <p className="mt-1 font-display text-base sm:text-2xl font-bold leading-none">
                      <CountUp
                        to={kpi.to}
                        format={(v) => (kpi.money ? `${num(v)} ${currency}` : num(v))}
                      />
                    </p>
                    <span className="mt-1.5 inline-block text-[10px] sm:text-xs font-semibold text-[hsl(var(--sv-good))]">
                      {kpi.delta}
                    </span>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-[1.35fr_1fr]">
                {/* Chart */}
                <div className="sv-mock-tile p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] sm:text-xs font-semibold">{t('landing.mock.chartTitle')}</p>
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[hsl(var(--sv-good))]">
                      <span className="sv-live-dot" />
                      LIVE
                    </span>
                  </div>
                  <svg viewBox="0 0 320 110" className="h-24 sm:h-32 w-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="sv-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--sv-accent))" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="hsl(var(--sv-accent))" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="sv-line" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="hsl(var(--sv-accent))" />
                        <stop offset="100%" stopColor="hsl(var(--sv-pink))" />
                      </linearGradient>
                    </defs>
                    {[27, 55, 83].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        x2="320"
                        y1={y}
                        y2={y}
                        stroke="hsl(var(--sv-line))"
                        strokeDasharray="3 5"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    <motion.path
                      d={CHART_AREA}
                      fill="url(#sv-area)"
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.9, duration: 0.9 }}
                    />
                    <motion.path
                      d={CHART_LINE}
                      fill="none"
                      stroke="url(#sv-line)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      initial={reduceMotion ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 0.5, duration: 1.6, ease: 'easeInOut' }}
                    />
                  </svg>
                </div>

                {/* Orders */}
                <div className="sv-mock-tile hidden md:block p-3 sm:p-4">
                  <p className="mb-2.5 text-[11px] sm:text-xs font-semibold">{t('landing.mock.recent')}</p>
                  <ul className="space-y-2">
                    {ORDERS.map((order, i) => (
                      <motion.li
                        key={order.id}
                        className="flex items-center gap-2.5"
                        initial={reduceMotion ? false : { opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.1 + i * 0.15, duration: 0.45 }}
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{
                            background: `linear-gradient(135deg, hsl(${255 + i * 35} 85% 62%), hsl(${290 + i * 30} 85% 58%))`,
                          }}
                        >
                          {order.who[0]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-semibold leading-tight">{order.id}</span>
                          <span className="block text-[10px] text-[hsl(var(--sv-ink))]/50 leading-tight">
                            {order.amount} {currency}
                          </span>
                        </span>
                        <span className={cn('sv-chip-status', STATUS_STYLE[order.status])}>
                          {t(`landing.mock.${order.status}`)}
                        </span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </MockWindow>
      </motion.div>
    </div>
  );
}

/** No props, so memo keeps page-level state changes (tabs, FAQ, nav) from re-rendering the hero. */
export const HeroMockup = memo(HeroMockupImpl);
