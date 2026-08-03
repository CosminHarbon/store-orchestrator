export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'spam';

export interface ReviewRow {
  id: string;
  product_id: string;
  user_id: string;
  customer_name: string;
  customer_email: string | null;
  rating: number;
  review_text: string | null;
  is_approved: boolean;
  status: ReviewStatus;
  merchant_reply: string | null;
  merchant_replied_at: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  product?: {
    id?: string;
    title: string;
    image?: string | null;
    sku?: string | null;
    price?: number | null;
  } | null;
}

export interface ReviewAnalytics {
  kpis: {
    total: number;
    pending: number;
    published: number;
    rejected: number;
    spam: number;
    avgRating: number;
    fiveStarPct: number;
    thisMonth: number;
    responseRate: number;
    approvalRate: number;
  };
  ratingDistribution: { rating: number; count: number }[];
  reviewsOverTime: { label: string; count: number }[];
  mostReviewed: { productId: string; title: string; count: number; avg: number }[];
  highestRated: { productId: string; title: string; count: number; avg: number }[];
  lowestRated: { productId: string; title: string; count: number; avg: number }[];
  insights: string[];
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export function normalizeReviewStatus(r: Partial<ReviewRow>): ReviewStatus {
  if (r.status === 'pending' || r.status === 'approved' || r.status === 'rejected' || r.status === 'spam') {
    return r.status;
  }
  return r.is_approved ? 'approved' : 'pending';
}

export function buildReviewAnalytics(reviews: ReviewRow[]): ReviewAnalytics {
  const now = new Date();
  const thisMonthKey = monthKey(now);
  const withStatus = reviews.map((r) => ({ ...r, status: normalizeReviewStatus(r) }));

  const total = withStatus.length;
  const pending = withStatus.filter((r) => r.status === 'pending').length;
  const published = withStatus.filter((r) => r.status === 'approved').length;
  const rejected = withStatus.filter((r) => r.status === 'rejected').length;
  const spam = withStatus.filter((r) => r.status === 'spam').length;
  const avgRating =
    total === 0 ? 0 : withStatus.reduce((s, r) => s + r.rating, 0) / total;
  const fiveStarPct =
    total === 0 ? 0 : (withStatus.filter((r) => r.rating === 5).length / total) * 100;
  const thisMonth = withStatus.filter((r) => monthKey(new Date(r.created_at)) === thisMonthKey).length;
  const replied = withStatus.filter((r) => !!(r.merchant_reply && r.merchant_reply.trim())).length;
  const responseRate = total === 0 ? 0 : (replied / total) * 100;
  const decided = published + rejected + spam;
  const approvalRate = decided === 0 ? 0 : (published / decided) * 100;

  const ratingDistribution = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: withStatus.filter((r) => r.rating === rating).length,
  }));

  const byMonth = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    byMonth.set(monthKey(d), 0);
  }
  for (const r of withStatus) {
    const k = monthKey(new Date(r.created_at));
    if (byMonth.has(k)) byMonth.set(k, (byMonth.get(k) || 0) + 1);
  }
  const reviewsOverTime = [...byMonth.entries()].map(([label, count]) => ({
    label: monthLabel(label),
    count,
  }));

  const byProduct = new Map<string, { title: string; ratings: number[] }>();
  for (const r of withStatus) {
    const title = r.product?.title || 'Unknown product';
    const prev = byProduct.get(r.product_id) || { title, ratings: [] };
    prev.ratings.push(r.rating);
    prev.title = title;
    byProduct.set(r.product_id, prev);
  }
  const productStats = [...byProduct.entries()].map(([productId, v]) => ({
    productId,
    title: v.title,
    count: v.ratings.length,
    avg: v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length,
  }));

  const mostReviewed = [...productStats].sort((a, b) => b.count - a.count).slice(0, 5);
  const highestRated = [...productStats]
    .filter((p) => p.count >= 1)
    .sort((a, b) => b.avg - a.avg || b.count - a.count)
    .slice(0, 5);
  const lowestRated = [...productStats]
    .filter((p) => p.count >= 1)
    .sort((a, b) => a.avg - b.avg || b.count - a.count)
    .slice(0, 5);

  const insights: string[] = [];
  if (total === 0) {
    insights.push('No reviews yet — enable storefront reviews and ask customers after delivery.');
  } else {
    if (fiveStarPct >= 60) insights.push(`Strong sentiment: ${fiveStarPct.toFixed(0)}% of reviews are 5★.`);
    if (pending > 0) insights.push(`${pending} review${pending === 1 ? '' : 's'} waiting for moderation.`);
    if (responseRate < 30 && published > 0) {
      insights.push('Response rate is low — replying to reviews builds trust.');
    } else if (responseRate >= 70) {
      insights.push(`Great engagement: you have replied to ${responseRate.toFixed(0)}% of reviews.`);
    }
    if (mostReviewed[0]) {
      insights.push(`"${mostReviewed[0].title}" has the most reviews (${mostReviewed[0].count}).`);
    }
    if (lowestRated[0] && lowestRated[0].avg <= 3) {
      insights.push(`"${lowestRated[0].title}" averages ${lowestRated[0].avg.toFixed(1)}★ — worth investigating.`);
    }
    const texts = withStatus
      .map((r) => (r.review_text || '').toLowerCase())
      .filter(Boolean)
      .join(' ');
    const keywords: [string, string][] = [
      ['delivery', 'Customers often mention delivery.'],
      ['shipping', 'Shipping comes up frequently in feedback.'],
      ['quality', 'Product quality is a recurring theme.'],
      ['size', 'Sizing is mentioned in several reviews.'],
      ['stock', 'Stock availability appears in customer comments.'],
      ['packaging', 'Packaging is noted by customers.'],
      ['price', 'Price/value is mentioned in feedback.'],
    ];
    for (const [kw, msg] of keywords) {
      const hits = (texts.match(new RegExp(kw, 'g')) || []).length;
      if (hits >= 2) insights.push(msg);
    }
  }

  return {
    kpis: {
      total,
      pending,
      published,
      rejected,
      spam,
      avgRating: Math.round(avgRating * 10) / 10,
      fiveStarPct: Math.round(fiveStarPct * 10) / 10,
      thisMonth,
      responseRate: Math.round(responseRate * 10) / 10,
      approvalRate: Math.round(approvalRate * 10) / 10,
    },
    ratingDistribution,
    reviewsOverTime,
    mostReviewed,
    highestRated,
    lowestRated,
    insights: insights.slice(0, 6),
  };
}

export function statusBadgeClass(status: ReviewStatus) {
  switch (status) {
    case 'approved':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-0';
    case 'pending':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0';
    case 'rejected':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-0';
    case 'spam':
      return 'bg-muted text-muted-foreground border-0';
  }
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
