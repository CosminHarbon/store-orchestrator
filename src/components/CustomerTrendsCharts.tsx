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
import { chartTooltipStyle, useChartTheme } from '@/hooks/useChartTheme';

interface CustomerTrendsChartsProps {
  analytics: CustomerAnalytics;
}

export default function CustomerTrendsCharts({ analytics }: CustomerTrendsChartsProps) {
  const theme = useChartTheme();
  const tip = chartTooltipStyle(theme);
  const axis = { fontSize: 11, fill: theme.axis };
  const pieColors = [theme.c3, theme.c4, theme.c2, theme.c5, theme.c1, theme.c3, theme.c4, theme.c2];
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
                    <stop offset="0%" stopColor={theme.c3} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={theme.c3} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                <XAxis dataKey="label" tick={axis} />
                <YAxis allowDecimals={false} tick={axis} width={32} />
                <Tooltip contentStyle={tip} />
                <Area
                  type="monotone"
                  dataKey="newCustomers"
                  stroke={theme.c3}
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
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tip} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart text="Not enough customer data yet." />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Revenue by Segment</CardTitle>
          <CardDescription>Where revenue concentrates</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {hasSegments ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.revenueBySegment.slice(0, 6)}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                <XAxis dataKey="segment" tick={{ ...axis, fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={axis} width={48} />
                <Tooltip contentStyle={tip} formatter={(v: number) => formatRon(v)} />
                <Bar dataKey="revenue" fill={theme.c2} radius={[4, 4, 0, 0]} name="Revenue" />
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
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                <XAxis dataKey="segment" tick={{ ...axis, fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={axis} width={32} />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="orders" fill={theme.c3} radius={[4, 4, 0, 0]} name="Orders" />
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
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                <XAxis dataKey="bucket" tick={axis} />
                <YAxis allowDecimals={false} tick={axis} width={32} />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="count" fill={theme.c4} radius={[4, 4, 0, 0]} name="Customers" />
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
