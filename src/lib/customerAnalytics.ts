import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { DateRange } from '@/components/DateRangeFilter';
import { formatPct, formatRon, previousPeriod } from '@/lib/paymentAnalytics';

export type CustomerSegment =
  | 'vip'
  | 'loyal'
  | 'returning'
  | 'new'
  | 'one_time'
  | 'high_value'
  | 'at_risk'
  | 'inactive';

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  vip: 'VIP',
  loyal: 'Loyal',
  returning: 'Returning',
  new: 'New',
  one_time: 'One-time',
  high_value: 'High Value',
  at_risk: 'At Risk',
  inactive: 'Inactive',
};

export interface RawCustomerOrder {
  id: string;
  customer_email: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string;
  total: number;
  created_at: string;
  payment_status: string;
  shipping_status: string;
  order_status: string | null;
  order_items: {
    product_title: string;
    quantity: number;
    product_price: number;
  }[];
}

export interface CustomerProfile {
  email: string;
  name: string;
  phone: string | null;
  names: string[];
  phones: string[];
  addresses: string[];
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  firstOrderDate: string;
  lastOrderDate: string;
  daysSinceLastOrder: number;
  segments: CustomerSegment[];
  primarySegment: CustomerSegment;
  status: 'active' | 'inactive';
  favoritePaymentMethod: 'Card' | 'Cash' | '—';
  totalProductsPurchased: number;
  favoriteCategories: string[];
  avgDaysBetweenOrders: number | null;
  orders: RawCustomerOrder[];
}

export type GrowthGranularity = 'daily' | 'weekly' | 'monthly';

export interface CustomerAnalytics {
  kpis: {
    totalCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    activeCustomers: number;
    growthPct: number;
    averageLtv: number;
    averageOrdersPerCustomer: number;
    averageSpendPerCustomer: number;
  };
  deltas: {
    totalCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    activeCustomers: number;
    averageLtv: number;
    averageOrdersPerCustomer: number;
    averageSpendPerCustomer: number;
  };
  segments: {
    key: CustomerSegment;
    label: string;
    count: number;
    revenue: number;
    averageSpend: number;
  }[];
  insights: string[];
  growth: { label: string; newCustomers: number; returningOrders: number }[];
  returningVsNew: { name: string; value: number }[];
  revenueBySegment: { segment: string; revenue: number; orders: number }[];
  ltvDistribution: { bucket: string; count: number }[];
  customers: CustomerProfile[];
}

function deltaPct(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function isCountableOrder(order: RawCustomerOrder) {
  return order.order_status !== 'awaiting_payment';
}

function paymentMethod(order: RawCustomerOrder): 'Card' | 'Cash' {
  return order.payment_status === 'cash' ? 'Cash' : 'Card';
}

function guessCategory(title: string) {
  const t = title.toLowerCase();
  if (t.includes('hoodie') || t.includes('shirt') || t.includes('tee') || t.includes('jacket')) {
    return 'Apparel';
  }
  if (t.includes('shoe') || t.includes('sneaker')) return 'Footwear';
  if (t.includes('bag') || t.includes('wallet')) return 'Accessories';
  return 'General';
}

export function buildCustomerProfiles(orders: RawCustomerOrder[], now = new Date()): CustomerProfile[] {
  const map = new Map<string, CustomerProfile>();

  for (const order of orders.filter(isCountableOrder)) {
    const email = (order.customer_email || '').trim().toLowerCase();
    if (!email) continue;

    const existing = map.get(email);
    const total = Number(order.total) || 0;

    if (!existing) {
      map.set(email, {
        email,
        name: order.customer_name || email,
        phone: order.customer_phone || null,
        names: order.customer_name ? [order.customer_name] : [],
        phones: order.customer_phone ? [order.customer_phone] : [],
        addresses: order.customer_address ? [order.customer_address] : [],
        totalOrders: 1,
        totalSpent: total,
        averageOrderValue: total,
        firstOrderDate: order.created_at,
        lastOrderDate: order.created_at,
        daysSinceLastOrder: differenceInCalendarDays(now, new Date(order.created_at)),
        segments: [],
        primarySegment: 'one_time',
        status: 'active',
        favoritePaymentMethod: paymentMethod(order),
        totalProductsPurchased: (order.order_items || []).reduce((s, i) => s + Number(i.quantity || 0), 0),
        favoriteCategories: [],
        avgDaysBetweenOrders: null,
        orders: [order],
      });
      continue;
    }

    existing.totalOrders += 1;
    existing.totalSpent += total;
    existing.averageOrderValue = existing.totalSpent / existing.totalOrders;
    existing.orders.push(order);
    existing.totalProductsPurchased += (order.order_items || []).reduce(
      (s, i) => s + Number(i.quantity || 0),
      0
    );

    if (order.customer_name && !existing.names.includes(order.customer_name)) {
      existing.names.push(order.customer_name);
      existing.name = existing.names[0];
    }
    if (order.customer_phone && !existing.phones.includes(order.customer_phone)) {
      existing.phones.push(order.customer_phone);
      if (!existing.phone) existing.phone = order.customer_phone;
    }
    if (order.customer_address && !existing.addresses.includes(order.customer_address)) {
      existing.addresses.push(order.customer_address);
    }

    if (new Date(order.created_at) > new Date(existing.lastOrderDate)) {
      existing.lastOrderDate = order.created_at;
    }
    if (new Date(order.created_at) < new Date(existing.firstOrderDate)) {
      existing.firstOrderDate = order.created_at;
    }
  }

  const profiles = Array.from(map.values());
  const spends = profiles.map((p) => p.totalSpent).sort((a, b) => a - b);
  const p90 = spends.length
    ? spends[Math.min(spends.length - 1, Math.floor(spends.length * 0.9))]
    : 0;
  const avgLtv = profiles.length
    ? profiles.reduce((s, p) => s + p.totalSpent, 0) / profiles.length
    : 0;

  for (const profile of profiles) {
    profile.daysSinceLastOrder = differenceInCalendarDays(now, new Date(profile.lastOrderDate));
    profile.status = profile.daysSinceLastOrder <= 30 ? 'active' : 'inactive';

    const methods = profile.orders.map(paymentMethod);
    const cash = methods.filter((m) => m === 'Cash').length;
    const card = methods.length - cash;
    profile.favoritePaymentMethod =
      methods.length === 0 ? '—' : card >= cash ? 'Card' : 'Cash';

    const categoryCount = new Map<string, number>();
    for (const order of profile.orders) {
      for (const item of order.order_items || []) {
        const cat = guessCategory(item.product_title || '');
        categoryCount.set(cat, (categoryCount.get(cat) || 0) + Number(item.quantity || 1));
      }
    }
    profile.favoriteCategories = [...categoryCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c]) => c);

    const sortedDates = [...profile.orders]
      .map((o) => new Date(o.created_at).getTime())
      .sort((a, b) => a - b);
    if (sortedDates.length >= 2) {
      let gaps = 0;
      for (let i = 1; i < sortedDates.length; i++) {
        gaps += (sortedDates[i] - sortedDates[i - 1]) / 86400000;
      }
      profile.avgDaysBetweenOrders = gaps / (sortedDates.length - 1);
    }

    const segments: CustomerSegment[] = [];
    const isNew =
      differenceInCalendarDays(now, new Date(profile.firstOrderDate)) <= 30;

    if (profile.totalOrders === 1) segments.push('one_time');
    if (isNew) segments.push('new');
    if (profile.totalOrders >= 2 && profile.totalOrders < 5) segments.push('returning');
    if (profile.totalOrders >= 5) segments.push('loyal');
    if (profile.totalSpent >= Math.max(p90, avgLtv * 2) && profile.totalSpent > 0) {
      segments.push('vip');
    }
    if (profile.totalSpent >= avgLtv * 1.5 && profile.totalSpent > 0) {
      segments.push('high_value');
    }
    if (profile.daysSinceLastOrder > 60 && profile.totalOrders >= 2 && profile.daysSinceLastOrder <= 120) {
      segments.push('at_risk');
    }
    if (profile.daysSinceLastOrder > 90) segments.push('inactive');

    if (!segments.length) segments.push('one_time');

    const priority: CustomerSegment[] = [
      'vip',
      'at_risk',
      'loyal',
      'high_value',
      'returning',
      'new',
      'inactive',
      'one_time',
    ];
    profile.segments = [...new Set(segments)];
    profile.primarySegment =
      priority.find((s) => profile.segments.includes(s)) || profile.segments[0];
  }

  return profiles.sort((a, b) => b.totalSpent - a.totalSpent);
}

function segmentStats(customers: CustomerProfile[]) {
  const keys = Object.keys(SEGMENT_LABELS) as CustomerSegment[];
  return keys.map((key) => {
    const list = customers.filter((c) => c.segments.includes(key));
    const revenue = list.reduce((s, c) => s + c.totalSpent, 0);
    return {
      key,
      label: SEGMENT_LABELS[key],
      count: list.length,
      revenue,
      averageSpend: list.length ? revenue / list.length : 0,
    };
  });
}

function buildGrowth(
  customers: CustomerProfile[],
  range: DateRange,
  granularity: GrowthGranularity
) {
  const buckets =
    granularity === 'daily'
      ? eachDayOfInterval({ start: range.from, end: range.to })
      : granularity === 'weekly'
        ? eachWeekOfInterval({ start: range.from, end: range.to }, { weekStartsOn: 1 })
        : eachMonthOfInterval({ start: range.from, end: range.to });

  return buckets.map((bucketStart) => {
    const key =
      granularity === 'daily'
        ? format(bucketStart, 'yyyy-MM-dd')
        : granularity === 'weekly'
          ? format(startOfWeek(bucketStart, { weekStartsOn: 1 }), 'yyyy-MM-dd')
          : format(startOfMonth(bucketStart), 'yyyy-MM');

    const label =
      granularity === 'daily'
        ? format(bucketStart, 'MMM d')
        : granularity === 'weekly'
          ? `W ${format(bucketStart, 'MMM d')}`
          : format(bucketStart, 'MMM yyyy');

    const newCustomers = customers.filter((c) => {
      const d = new Date(c.firstOrderDate);
      const bucketKey =
        granularity === 'daily'
          ? format(d, 'yyyy-MM-dd')
          : granularity === 'weekly'
            ? format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
            : format(startOfMonth(d), 'yyyy-MM');
      return bucketKey === key;
    }).length;

    return { label, newCustomers, returningOrders: 0 };
  });
}

export function buildCustomerAnalytics(input: {
  orders: RawCustomerOrder[];
  range: DateRange;
  granularity: GrowthGranularity;
}): CustomerAnalytics {
  const now = new Date();
  const allCustomers = buildCustomerProfiles(input.orders, now);
  const prev = previousPeriod(input.range);

  const customersInView = allCustomers; // full CRM roster; KPIs use period overlays

  const newInPeriod = allCustomers.filter((c) => {
    const d = new Date(c.firstOrderDate);
    return d >= input.range.from && d <= input.range.to;
  });
  const newInPrev = allCustomers.filter((c) => {
    const d = new Date(c.firstOrderDate);
    return d >= prev.from && d <= prev.to;
  });

  const returning = allCustomers.filter((c) => c.totalOrders > 1);

  const active = allCustomers.filter((c) => c.status === 'active');
  const activePrev = allCustomers.filter((c) => {
    const daysAgo = differenceInCalendarDays(now, new Date(c.lastOrderDate));
    // approximate prior active as last order within 30–60 days window relative to period end
    return daysAgo > 30 && daysAgo <= 60;
  });

  const totalSpent = allCustomers.reduce((s, c) => s + c.totalSpent, 0);
  const totalOrders = allCustomers.reduce((s, c) => s + c.totalOrders, 0);
  const averageLtv = allCustomers.length ? totalSpent / allCustomers.length : 0;
  const averageOrders = allCustomers.length ? totalOrders / allCustomers.length : 0;

  const prevCustomerCount = Math.max(0, allCustomers.length - newInPeriod.length);
  const growthPct = deltaPct(allCustomers.length, prevCustomerCount || newInPrev.length);

  const segments = segmentStats(allCustomers);

  const oneTimePct = allCustomers.length
    ? (allCustomers.filter((c) => c.totalOrders === 1).length / allCustomers.length) * 100
    : 0;
  const returningPct = allCustomers.length
    ? (returning.length / allCustomers.length) * 100
    : 0;

  const topSpender = allCustomers[0];
  const mostLoyal = [...allCustomers].sort((a, b) => b.totalOrders - a.totalOrders)[0];
  const avgGapCustomers = allCustomers.filter((c) => c.avgDaysBetweenOrders != null);
  const avgGap = avgGapCustomers.length
    ? avgGapCustomers.reduce((s, c) => s + (c.avgDaysBetweenOrders || 0), 0) /
      avgGapCustomers.length
    : null;
  const highSpenders = allCustomers.filter((c) => c.totalSpent >= averageLtv * 2).length;
  const dormant = allCustomers.filter((c) => c.daysSinceLastOrder > 60).length;

  const insights: string[] = [];
  if (topSpender) {
    insights.push(
      `${topSpender.name} is your highest spending customer (${formatRon(topSpender.totalSpent)}).`
    );
  }
  if (mostLoyal) {
    insights.push(
      `${mostLoyal.name} is your most loyal customer with ${mostLoyal.totalOrders} orders.`
    );
  }
  if (avgGap != null) {
    insights.push(`Average time between purchases is ${Math.round(avgGap)} days.`);
  }
  insights.push(`${formatPct(returningPct, 0)} of customers are returning buyers.`);
  insights.push(`${formatPct(oneTimePct, 0)} of customers are one-time buyers.`);
  if (highSpenders > 0) {
    insights.push(`${highSpenders} customer${highSpenders === 1 ? '' : 's'} spent above 2× average LTV.`);
  }
  if (dormant > 0) {
    insights.push(`${dormant} customer${dormant === 1 ? '' : 's'} haven't purchased in over 60 days.`);
  }
  if (!allCustomers.length) {
    insights.length = 0;
    insights.push('Orders will unlock customer insights automatically.');
  }

  const ltvDistribution = [
    { bucket: '0–100', count: allCustomers.filter((c) => c.totalSpent < 100).length },
    { bucket: '100–500', count: allCustomers.filter((c) => c.totalSpent >= 100 && c.totalSpent < 500).length },
    { bucket: '500–1k', count: allCustomers.filter((c) => c.totalSpent >= 500 && c.totalSpent < 1000).length },
    { bucket: '1k–5k', count: allCustomers.filter((c) => c.totalSpent >= 1000 && c.totalSpent < 5000).length },
    { bucket: '5k+', count: allCustomers.filter((c) => c.totalSpent >= 5000).length },
  ];

  return {
    kpis: {
      totalCustomers: allCustomers.length,
      newCustomers: newInPeriod.length,
      returningCustomers: returning.length,
      activeCustomers: active.length,
      growthPct,
      averageLtv,
      averageOrdersPerCustomer: averageOrders,
      averageSpendPerCustomer: averageLtv,
    },
    deltas: {
      totalCustomers: deltaPct(allCustomers.length, Math.max(prevCustomerCount, 1)),
      newCustomers: deltaPct(newInPeriod.length, newInPrev.length),
      returningCustomers: 0,
      activeCustomers: deltaPct(active.length, Math.max(activePrev.length, 1)),
      averageLtv: 0,
      averageOrdersPerCustomer: 0,
      averageSpendPerCustomer: 0,
    },
    segments,
    insights: insights.slice(0, 6),
    growth: buildGrowth(allCustomers, input.range, input.granularity),
    returningVsNew: [
      { name: 'Returning', value: returning.length },
      { name: 'One-time', value: allCustomers.filter((c) => c.totalOrders === 1).length },
    ],
    revenueBySegment: segments
      .filter((s) => s.count > 0)
      .map((s) => ({
        segment: s.label,
        revenue: s.revenue,
        orders: allCustomers
          .filter((c) => c.segments.includes(s.key))
          .reduce((sum, c) => sum + c.totalOrders, 0),
      })),
    ltvDistribution,
    customers: customersInView,
  };
}

export function filterCustomers(
  customers: CustomerProfile[],
  opts: {
    search: string;
    segment: CustomerSegment | 'all';
    paymentMethod: 'all' | 'card' | 'cash';
    orderCount: 'all' | '1' | '2-4' | '5+';
    spendMin: number | null;
    spendMax: number | null;
    status: 'all' | 'active' | 'inactive';
  }
) {
  const q = opts.search.trim().toLowerCase();

  return customers.filter((c) => {
    if (opts.segment !== 'all' && !c.segments.includes(opts.segment)) return false;
    if (opts.status !== 'all' && c.status !== opts.status) return false;
    if (opts.paymentMethod === 'card' && c.favoritePaymentMethod !== 'Card') return false;
    if (opts.paymentMethod === 'cash' && c.favoritePaymentMethod !== 'Cash') return false;
    if (opts.orderCount === '1' && c.totalOrders !== 1) return false;
    if (opts.orderCount === '2-4' && (c.totalOrders < 2 || c.totalOrders > 4)) return false;
    if (opts.orderCount === '5+' && c.totalOrders < 5) return false;
    if (opts.spendMin != null && c.totalSpent < opts.spendMin) return false;
    if (opts.spendMax != null && c.totalSpent > opts.spendMax) return false;

    if (!q) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    if (c.email.toLowerCase().includes(q)) return true;
    if (c.phone?.toLowerCase().includes(q)) return true;
    if (c.names.some((n) => n.toLowerCase().includes(q))) return true;
    if (c.phones.some((p) => p.toLowerCase().includes(q))) return true;
    if (c.orders.some((o) => o.id.toLowerCase().includes(q) || o.id.slice(-8).includes(q))) {
      return true;
    }
    return false;
  });
}

export { formatRon, formatPct, previousPeriod };
