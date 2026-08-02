import { differenceInCalendarDays, eachMonthOfInterval, format, startOfMonth, subMonths } from 'date-fns';
import { formatRon } from '@/lib/paymentAnalytics';

export interface CatalogProduct {
  id: string;
  title: string;
  description: string | null;
  price: number;
  image: string | null;
  category: string | null;
  stock: number;
  sku: string | null;
  low_stock_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface ProductSaleRow {
  product_id: string | null;
  product_title: string;
  product_price: number;
  quantity: number;
  created_at: string;
}

export type ProductStockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';
export type ProductBadge =
  | 'best_seller'
  | 'trending'
  | 'low_stock'
  | 'out_of_stock'
  | 'never_sold'
  | 'recently_added'
  | 'highest_revenue';

export interface ProductMetrics {
  orders: number;
  unitsSold: number;
  revenue: number;
  badges: ProductBadge[];
  stockStatus: ProductStockStatus;
  recommendation: 'restock_soon' | 'high_selling' | 'not_selling' | 'healthy' | null;
}

export interface ProductAnalytics {
  kpis: {
    totalProducts: number;
    activeProducts: number;
    outOfStock: number;
    lowStock: number;
    inventoryValue: number;
    averagePrice: number;
    addedThisMonth: number;
  };
  deltas: {
    totalProducts: number;
    addedThisMonth: number;
  };
  bestSellers: { id: string; title: string; units: number; revenue: number }[];
  worstPerformers: { id: string; title: string; units: number; revenue: number }[];
  highestRevenue: { id: string; title: string; revenue: number }[];
  categorySales: { category: string; orders: number; revenue: number }[];
  inventoryDistribution: { name: string; value: number }[];
  productsAddedOverTime: { label: string; count: number }[];
  salesByProduct: { title: string; units: number; revenue: number }[];
  insights: string[];
  metricsById: Record<string, ProductMetrics>;
}

function deltaPct(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

export function getStockStatus(product: CatalogProduct): ProductStockStatus {
  if (product.stock <= 0) return 'out_of_stock';
  if (product.stock <= (product.low_stock_threshold ?? 5)) return 'low_stock';
  return 'in_stock';
}

export function buildProductAnalytics(
  products: CatalogProduct[],
  sales: ProductSaleRow[],
  now = new Date()
): ProductAnalytics {
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfMonth(subMonths(now, 1));
  const prevMonthEnd = monthStart;

  const totalProducts = products.length;
  const outOfStock = products.filter((p) => p.stock <= 0).length;
  const lowStock = products.filter(
    (p) => p.stock > 0 && p.stock <= (p.low_stock_threshold ?? 5)
  ).length;
  const activeProducts = products.filter((p) => p.stock > 0).length;
  const inventoryValue = products.reduce((s, p) => s + Number(p.price) * Math.max(0, Number(p.stock)), 0);
  const averagePrice = totalProducts
    ? products.reduce((s, p) => s + Number(p.price), 0) / totalProducts
    : 0;
  const addedThisMonth = products.filter((p) => new Date(p.created_at) >= monthStart).length;
  const addedPrevMonth = products.filter((p) => {
    const d = new Date(p.created_at);
    return d >= prevMonthStart && d < prevMonthEnd;
  }).length;
  const productsPrevApprox = Math.max(0, totalProducts - addedThisMonth);

  const salesByProduct = new Map<
    string,
    { id: string; title: string; units: number; revenue: number; orders: Set<string>; recentUnits: number }
  >();

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  for (const row of sales) {
    const key = row.product_id || `title:${row.product_title}`;
    const existing = salesByProduct.get(key) || {
      id: row.product_id || key,
      title: row.product_title,
      units: 0,
      revenue: 0,
      orders: new Set<string>(),
      recentUnits: 0,
    };
    existing.units += Number(row.quantity) || 0;
    existing.revenue += (Number(row.product_price) || 0) * (Number(row.quantity) || 0);
    if (row.created_at) existing.orders.add(`${row.created_at}-${row.product_title}`);
    if (new Date(row.created_at) >= thirtyDaysAgo) {
      existing.recentUnits += Number(row.quantity) || 0;
    }
    if (!existing.title && row.product_title) existing.title = row.product_title;
    salesByProduct.set(key, existing);
  }

  // Map by product id primarily
  const byId = new Map<string, { units: number; revenue: number; orders: number; recentUnits: number; title: string }>();
  for (const product of products) {
    byId.set(product.id, { units: 0, revenue: 0, orders: 0, recentUnits: 0, title: product.title });
  }
  for (const row of sales) {
    if (!row.product_id || !byId.has(row.product_id)) continue;
    const entry = byId.get(row.product_id)!;
    entry.units += Number(row.quantity) || 0;
    entry.revenue += (Number(row.product_price) || 0) * (Number(row.quantity) || 0);
    entry.orders += 1;
    if (new Date(row.created_at) >= thirtyDaysAgo) {
      entry.recentUnits += Number(row.quantity) || 0;
    }
  }

  const ranked = [...byId.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.units - a.units);

  const bestSellers = ranked.filter((r) => r.units > 0).slice(0, 5);
  const worstPerformers = [...ranked]
    .filter((r) => r.units >= 0)
    .sort((a, b) => a.units - b.units || a.revenue - b.revenue)
    .slice(0, 5);
  const highestRevenue = [...ranked].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const bestSellerIds = new Set(bestSellers.slice(0, 3).map((b) => b.id));
  const highestRevenueId = highestRevenue[0]?.revenue > 0 ? highestRevenue[0].id : null;
  const trendingIds = new Set(
    [...ranked]
      .filter((r) => r.recentUnits > 0)
      .sort((a, b) => b.recentUnits - a.recentUnits)
      .slice(0, 3)
      .map((r) => r.id)
  );

  const metricsById: Record<string, ProductMetrics> = {};
  for (const product of products) {
    const m = byId.get(product.id)!;
    const stockStatus = getStockStatus(product);
    const badges: ProductBadge[] = [];
    if (stockStatus === 'out_of_stock') badges.push('out_of_stock');
    else if (stockStatus === 'low_stock') badges.push('low_stock');
    if (bestSellerIds.has(product.id)) badges.push('best_seller');
    if (trendingIds.has(product.id)) badges.push('trending');
    if (highestRevenueId === product.id) badges.push('highest_revenue');
    if (m.units === 0) badges.push('never_sold');
    if (differenceInCalendarDays(now, new Date(product.created_at)) <= 14) {
      badges.push('recently_added');
    }

    let recommendation: ProductMetrics['recommendation'] = 'healthy';
    if (stockStatus === 'low_stock' || stockStatus === 'out_of_stock') recommendation = 'restock_soon';
    else if (m.recentUnits > 0 && m.units >= 3) recommendation = 'high_selling';
    else if (m.units === 0 && differenceInCalendarDays(now, new Date(product.created_at)) > 30) {
      recommendation = 'not_selling';
    }

    metricsById[product.id] = {
      orders: m.orders,
      unitsSold: m.units,
      revenue: m.revenue,
      badges,
      stockStatus,
      recommendation,
    };
  }

  const categoryMap = new Map<string, { orders: number; revenue: number }>();
  for (const product of products) {
    const cat = product.category?.trim() || 'Uncategorized';
    const m = metricsById[product.id];
    const existing = categoryMap.get(cat) || { orders: 0, revenue: 0 };
    existing.orders += m.orders;
    existing.revenue += m.revenue;
    categoryMap.set(cat, existing);
  }

  const months = eachMonthOfInterval({
    start: subMonths(startOfMonth(now), 5),
    end: startOfMonth(now),
  });
  const productsAddedOverTime = months.map((month) => {
    const key = format(month, 'yyyy-MM');
    return {
      label: format(month, 'MMM yyyy'),
      count: products.filter((p) => format(new Date(p.created_at), 'yyyy-MM') === key).length,
    };
  });

  const insights: string[] = [];
  if (bestSellers[0]?.units > 0) {
    insights.push(
      `${bestSellers[0].title} is your best seller (${bestSellers[0].units} units sold).`
    );
  }
  if (highestRevenue[0]?.revenue > 0) {
    insights.push(
      `${highestRevenue[0].title} generated the most revenue (${formatRon(highestRevenue[0].revenue)}).`
    );
  }
  if (lowStock > 0) {
    insights.push(`${lowStock} product${lowStock === 1 ? '' : 's'} are running low on stock.`);
  }
  if (outOfStock > 0) {
    insights.push(`${outOfStock} product${outOfStock === 1 ? '' : 's'} are out of stock.`);
  }
  const neverSold = products.filter((p) => metricsById[p.id].unitsSold === 0).length;
  if (neverSold > 0) {
    insights.push(`${neverSold} product${neverSold === 1 ? '' : 's'} have never been sold.`);
  }
  if (!insights.length) {
    insights.push('Add products and start selling to unlock catalog insights.');
  }

  return {
    kpis: {
      totalProducts,
      activeProducts,
      outOfStock,
      lowStock,
      inventoryValue,
      averagePrice,
      addedThisMonth,
    },
    deltas: {
      totalProducts: deltaPct(totalProducts, Math.max(productsPrevApprox, 1)),
      addedThisMonth: deltaPct(addedThisMonth, addedPrevMonth),
    },
    bestSellers: bestSellers.map((b) => ({
      id: b.id,
      title: b.title,
      units: b.units,
      revenue: b.revenue,
    })),
    worstPerformers: worstPerformers.map((b) => ({
      id: b.id,
      title: b.title,
      units: b.units,
      revenue: b.revenue,
    })),
    highestRevenue: highestRevenue.map((b) => ({
      id: b.id,
      title: b.title,
      revenue: b.revenue,
    })),
    categorySales: [...categoryMap.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8),
    inventoryDistribution: [
      { name: 'In Stock', value: activeProducts - lowStock },
      { name: 'Low Stock', value: lowStock },
      { name: 'Out of Stock', value: outOfStock },
    ],
    productsAddedOverTime,
    salesByProduct: ranked
      .filter((r) => r.units > 0)
      .slice(0, 8)
      .map((r) => ({ title: r.title, units: r.units, revenue: r.revenue })),
    insights: insights.slice(0, 6),
    metricsById,
  };
}

export function filterCatalogProducts(
  products: CatalogProduct[],
  metricsById: Record<string, ProductMetrics>,
  opts: {
    search: string;
    stockFilter: 'all' | ProductStockStatus;
    category: string;
    collectionId: string;
    productCollectionMap: Record<string, string[]>;
    priceMin: number | null;
    priceMax: number | null;
    stockMin: number | null;
    stockMax: number | null;
  }
) {
  const q = opts.search.trim().toLowerCase();
  return products.filter((p) => {
    const metrics = metricsById[p.id];
    if (opts.stockFilter !== 'all' && metrics?.stockStatus !== opts.stockFilter) return false;
    if (opts.category !== 'all') {
      const cat = p.category?.trim() || 'Uncategorized';
      if (cat !== opts.category) return false;
    }
    if (opts.collectionId !== 'all') {
      const cols = opts.productCollectionMap[p.id] || [];
      if (!cols.includes(opts.collectionId)) return false;
    }
    if (opts.priceMin != null && Number(p.price) < opts.priceMin) return false;
    if (opts.priceMax != null && Number(p.price) > opts.priceMax) return false;
    if (opts.stockMin != null && Number(p.stock) < opts.stockMin) return false;
    if (opts.stockMax != null && Number(p.stock) > opts.stockMax) return false;

    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  });
}

export { formatRon };
