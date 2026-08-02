import { differenceInCalendarDays, eachDayOfInterval, format, subMilliseconds } from 'date-fns';
import type { DateRange } from '@/components/DateRangeFilter';

export interface AnalyticsOrder {
  id: string;
  customer_name: string;
  customer_email: string;
  total: number;
  payment_status: string;
  shipping_status: string;
  order_status: string | null;
  checkout_session_id: string | null;
  created_at: string;
}

export interface AnalyticsTransaction {
  id: string;
  order_id: string | null;
  checkout_session_id: string | null;
  payment_status: string;
  amount: number;
  currency: string;
  payment_method?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsCheckoutSession {
  id: string;
  status: string;
  payment_status: string;
  total: number;
  customer_name: string;
  customer_email: string;
  created_at: string;
  expires_at: string;
  updated_at: string;
  order_id: string | null;
}

export function formatRon(amount: number) {
  return `${Number(amount || 0).toLocaleString('ro-RO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} RON`;
}

export function formatPct(value: number, digits = 1) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(digits)}%`;
}

export function previousPeriod(range: DateRange): DateRange {
  const durationMs = range.to.getTime() - range.from.getTime();
  const to = subMilliseconds(range.from, 1);
  const from = new Date(to.getTime() - durationMs);
  return { from, to };
}

export function isCashOrder(order: AnalyticsOrder) {
  return order.payment_status === 'cash';
}

export function isCardPaidOrder(order: AnalyticsOrder) {
  return (
    order.payment_status === 'paid' ||
    order.payment_status === 'invoiced' ||
    (!!order.checkout_session_id &&
      order.payment_status !== 'cash' &&
      order.payment_status !== 'refunded' &&
      order.payment_status !== 'failed' &&
      order.payment_status !== 'pending')
  );
}

export function isRevenueOrder(order: AnalyticsOrder) {
  return isCashOrder(order) || order.payment_status === 'paid' || order.payment_status === 'invoiced';
}

export function isRealOrder(order: AnalyticsOrder) {
  return order.order_status !== 'awaiting_payment';
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function deltaPct(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

export interface PaymentAnalytics {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  paymentSuccessRate: number;
  pendingCardCount: number;
  pendingCardRevenue: number;
  failedPayments: number;
  refundedPayments: number;
  refundedRevenue: number;
  cancelledRevenue: number;
  card: { orders: number; revenue: number; aov: number; pctOrders: number; pctRevenue: number };
  cash: { orders: number; revenue: number; aov: number; pctOrders: number; pctRevenue: number };
  funnel: {
    ordersCreated: number;
    paymentStarted: number;
    paymentCompleted: number;
    paymentFailed: number;
    abandonedPayment: number;
  };
  stats: {
    highest: number;
    lowest: number;
    aov: number;
    median: number;
    mostUsedMethod: 'Card' | 'Cash' | '—';
    conversionRate: number;
    avgTimeToPayMinutes: number | null;
    pendingPaymentCount: number;
    expiredSessions: number;
    successfulCard: number;
    cancelledCard: number;
  };
  deltas: {
    revenue: number;
    orders: number;
    aov: number;
    successRate: number;
  };
  trends: {
    date: string;
    label: string;
    revenue: number;
    orders: number;
    cardRevenue: number;
    cashRevenue: number;
    successRate: number;
  }[];
  insights: string[];
  recentOrders: AnalyticsOrder[];
}

function computePeriodMetrics(
  orders: AnalyticsOrder[],
  transactions: AnalyticsTransaction[],
  sessions: AnalyticsCheckoutSession[]
) {
  const realOrders = orders.filter(isRealOrder);
  const revenueOrders = realOrders.filter(isRevenueOrder);
  const cashOrders = revenueOrders.filter(isCashOrder);
  const cardOrders = revenueOrders.filter((o) => !isCashOrder(o));

  const totalRevenue = revenueOrders.reduce((s, o) => s + Number(o.total), 0);
  const cashRevenue = cashOrders.reduce((s, o) => s + Number(o.total), 0);
  const cardRevenue = cardOrders.reduce((s, o) => s + Number(o.total), 0);

  const pendingSessions = sessions.filter((s) => s.status === 'pending');
  const expiredSessions = sessions.filter((s) => s.status === 'expired');
  const cancelledSessions = sessions.filter((s) => s.status === 'cancelled');
  const convertedSessions = sessions.filter((s) => s.status === 'converted' || s.status === 'paid');

  const failedTx = transactions.filter(
    (t) => t.payment_status === 'failed' || t.payment_status === 'cancelled'
  );
  const refundedOrders = realOrders.filter((o) => o.payment_status === 'refunded');

  const completedCount = revenueOrders.length;
  const unsuccessful = failedTx.length + expiredSessions.length + cancelledSessions.length;
  const successDenom = completedCount + unsuccessful;
  const successRate = successDenom > 0 ? (completedCount / successDenom) * 100 : 0;

  const totals = revenueOrders.map((o) => Number(o.total));
  const aov = totals.length ? totalRevenue / totals.length : 0;

  // Time to pay for converted sessions with matching orders
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const payTimes: number[] = [];
  for (const session of convertedSessions) {
    const order = session.order_id ? orderById.get(session.order_id) : undefined;
    const end = order ? new Date(order.created_at).getTime() : new Date(session.updated_at).getTime();
    const start = new Date(session.created_at).getTime();
    if (end > start) payTimes.push((end - start) / 60000);
  }

  const methodOrderTotal = cashOrders.length + cardOrders.length;
  const mostUsedMethod: 'Card' | 'Cash' | '—' =
    methodOrderTotal === 0
      ? '—'
      : cardOrders.length >= cashOrders.length
        ? 'Card'
        : 'Cash';

  const paymentStarted = cashOrders.length + sessions.length;
  const conversionRate =
    paymentStarted > 0 ? (completedCount / paymentStarted) * 100 : 0;

  return {
    totalRevenue,
    totalOrders: realOrders.length,
    averageOrderValue: aov,
    paymentSuccessRate: successRate,
    pendingCardCount: pendingSessions.length,
    pendingCardRevenue: pendingSessions.reduce((s, x) => s + Number(x.total), 0),
    failedPayments: failedTx.length,
    refundedPayments: refundedOrders.length,
    refundedRevenue: refundedOrders.reduce((s, o) => s + Number(o.total), 0),
    cancelledRevenue: cancelledSessions.reduce((s, x) => s + Number(x.total), 0),
    card: {
      orders: cardOrders.length,
      revenue: cardRevenue,
      aov: cardOrders.length ? cardRevenue / cardOrders.length : 0,
      pctOrders: methodOrderTotal ? (cardOrders.length / methodOrderTotal) * 100 : 0,
      pctRevenue: totalRevenue ? (cardRevenue / totalRevenue) * 100 : 0,
    },
    cash: {
      orders: cashOrders.length,
      revenue: cashRevenue,
      aov: cashOrders.length ? cashRevenue / cashOrders.length : 0,
      pctOrders: methodOrderTotal ? (cashOrders.length / methodOrderTotal) * 100 : 0,
      pctRevenue: totalRevenue ? (cashRevenue / totalRevenue) * 100 : 0,
    },
    funnel: {
      ordersCreated: realOrders.length + pendingSessions.length + expiredSessions.length,
      paymentStarted,
      paymentCompleted: completedCount,
      paymentFailed: failedTx.length,
      abandonedPayment: expiredSessions.length,
    },
    stats: {
      highest: totals.length ? Math.max(...totals) : 0,
      lowest: totals.length ? Math.min(...totals) : 0,
      aov,
      median: median(totals),
      mostUsedMethod,
      conversionRate,
      avgTimeToPayMinutes: payTimes.length
        ? payTimes.reduce((a, b) => a + b, 0) / payTimes.length
        : null,
      pendingPaymentCount: pendingSessions.length,
      expiredSessions: expiredSessions.length,
      successfulCard: cardOrders.length,
      cancelledCard: cancelledSessions.length,
    },
    revenueOrders,
    cashOrders,
    cardOrders,
    pendingSessions,
    expiredSessions,
  };
}

export function buildPaymentAnalytics(input: {
  range: DateRange;
  orders: AnalyticsOrder[];
  prevOrders: AnalyticsOrder[];
  transactions: AnalyticsTransaction[];
  prevTransactions: AnalyticsTransaction[];
  sessions: AnalyticsCheckoutSession[];
  prevSessions: AnalyticsCheckoutSession[];
}): PaymentAnalytics {
  const current = computePeriodMetrics(input.orders, input.transactions, input.sessions);
  const previous = computePeriodMetrics(
    input.prevOrders,
    input.prevTransactions,
    input.prevSessions
  );

  const days = Math.max(1, differenceInCalendarDays(input.range.to, input.range.from) + 1);
  const dayList =
    days <= 120
      ? eachDayOfInterval({ start: input.range.from, end: input.range.to })
      : eachDayOfInterval({ start: input.range.from, end: input.range.to }).filter(
          (_, i, arr) => i % Math.ceil(arr.length / 60) === 0 || i === arr.length - 1
        );

  const trends = dayList.map((day) => {
    const key = format(day, 'yyyy-MM-dd');
    const dayOrders = current.revenueOrders.filter(
      (o) => format(new Date(o.created_at), 'yyyy-MM-dd') === key
    );
    const cardRevenue = dayOrders
      .filter((o) => !isCashOrder(o))
      .reduce((s, o) => s + Number(o.total), 0);
    const cashRevenue = dayOrders
      .filter(isCashOrder)
      .reduce((s, o) => s + Number(o.total), 0);
    const revenue = cardRevenue + cashRevenue;
    const dayFailed = input.transactions.filter(
      (t) =>
        format(new Date(t.created_at), 'yyyy-MM-dd') === key &&
        (t.payment_status === 'failed' || t.payment_status === 'cancelled')
    ).length;
    const dayExpired = input.sessions.filter(
      (s) =>
        format(new Date(s.created_at), 'yyyy-MM-dd') === key && s.status === 'expired'
    ).length;
    const completed = dayOrders.length;
    const denom = completed + dayFailed + dayExpired;
    return {
      date: key,
      label: format(day, days <= 14 ? 'MMM d' : 'MMM d'),
      revenue,
      orders: dayOrders.length,
      cardRevenue,
      cashRevenue,
      successRate: denom > 0 ? (completed / denom) * 100 : 0,
    };
  });

  const insights: string[] = [];
  if (current.card.orders + current.cash.orders > 0) {
    insights.push(
      `${formatPct(current.card.pctOrders, 0)} of customers pay by card.`
    );
    insights.push(
      `Card payments generate ${formatPct(current.card.pctRevenue, 0)} of your revenue.`
    );
  }
  const aovDelta = deltaPct(current.averageOrderValue, previous.averageOrderValue);
  if (aovDelta > 3) {
    insights.push('Average order value is increasing.');
  } else if (aovDelta < -3) {
    insights.push('Average order value is decreasing compared to the previous period.');
  }
  if (current.pendingCardCount > 0) {
    insights.push(
      `You currently have ${current.pendingCardCount} pending card payment${current.pendingCardCount === 1 ? '' : 's'}.`
    );
  }
  if (current.stats.expiredSessions > 0) {
    insights.push(
      `${current.stats.expiredSessions} checkout session${current.stats.expiredSessions === 1 ? '' : 's'} expired in this period.`
    );
  }
  if (current.totalOrders > 0 || current.failedPayments > 0) {
    insights.push(`Your payment success rate is ${formatPct(current.paymentSuccessRate)}.`);
  }
  if (current.cash.pctOrders > 50) {
    insights.push('Cash on delivery is currently your most used payment method.');
  }
  if (!insights.length) {
    insights.push('Start receiving orders to unlock payment insights.');
  }

  const recentOrders = [...input.orders]
    .filter(isRealOrder)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 12);

  return {
    totalRevenue: current.totalRevenue,
    totalOrders: current.totalOrders,
    averageOrderValue: current.averageOrderValue,
    paymentSuccessRate: current.paymentSuccessRate,
    pendingCardCount: current.pendingCardCount,
    pendingCardRevenue: current.pendingCardRevenue,
    failedPayments: current.failedPayments,
    refundedPayments: current.refundedPayments,
    refundedRevenue: current.refundedRevenue,
    cancelledRevenue: current.cancelledRevenue,
    card: current.card,
    cash: current.cash,
    funnel: current.funnel,
    stats: current.stats,
    deltas: {
      revenue: deltaPct(current.totalRevenue, previous.totalRevenue),
      orders: deltaPct(current.totalOrders, previous.totalOrders),
      aov: deltaPct(current.averageOrderValue, previous.averageOrderValue),
      successRate: deltaPct(current.paymentSuccessRate, previous.paymentSuccessRate),
    },
    trends,
    insights: insights.slice(0, 6),
    recentOrders,
  };
}
