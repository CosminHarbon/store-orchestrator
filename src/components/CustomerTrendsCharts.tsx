import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CustomerAnalytics } from '@/lib/customerAnalytics';
import { formatRon } from '@/lib/customerAnalytics';

const PIE_COLORS = ['hsl(215 55% 45%)', 'hsl(32 80% 50%)', 'hsl(160 50% 40%)', 'hsl(340 55% 50%)', 'hsl(250 40% 55%)', 'hsl(190 50% 40%)', 'hsl(20 70% 50%)', 'hsl(100 40% 40%)'];

interface CustomerTrendsChartsProps {
  analytics: CustomerAnalytics;
}

export default function CustomerTrendsCharts({ analytics }: CustomerTrendsChartsProps) {
  const hasGrowth = analytics.growth.some((g) => g.newCustomers > 0);
  const hasSegments = analytics.revenueBySegment.some((s) => s.revenue > 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card className="border-border/60 xl:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Customer Growth</CardTitle>
          <CardDescription>New customers over time</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {hasGrowth ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.growth}>
                <defs>
                  <linearGradient id="custGrowth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(215 55% 45%)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(215 55% 45%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="newCustomers"
                  stroke="hsl(215 55% 40%)"
                  fill="url(#custGrowth)"
                  strokeWidth={2}
                  name="New customers"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="No new customers in this period yet." />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Returning vs One-time</CardTitle>
          <CardDescription>Customer purchase behavior</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {analytics.returningVsNew.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.returningVsNew}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {analytics.returningVsNew.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="Not enough customer data yet." />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Lifetime by Segment</CardTitle>
          <CardDescription>Where revenue concentrates</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {hasSegments ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.revenueBySegment.slice(0, 6)}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis dataKey="segment" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip formatter={(v: number) => formatRon(v)} />
                <Bar dataKey="revenue" fill="hsl(160 50% 40%)" radius={[4, 4, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="Segment revenue appears after orders." />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Orders by Segment</CardTitle>
          <CardDescription>Order volume across segments</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {hasSegments ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.revenueBySegment.slice(0, 6)}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis dataKey="segment" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                <Tooltip />
                <Bar dataKey="orders" fill="hsl(215 50% 45%)" radius={[4, 4, 0, 0]} name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="Segment orders appear after purchases." />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Lifetime Value Distribution</CardTitle>
          <CardDescription>How many customers fall into each spend band</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {analytics.ltvDistribution.some((d) => d.count > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.ltvDistribution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(32 75% 48%)" radius={[4, 4, 0, 0]} name="Customers" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="LTV distribution unlocks with orders." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-6">
      {text}
    </div>
  );
}
