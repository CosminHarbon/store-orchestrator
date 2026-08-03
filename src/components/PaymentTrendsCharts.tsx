import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PaymentAnalytics } from '@/lib/paymentAnalytics';
import { formatRon } from '@/lib/paymentAnalytics';
import { chartTooltipStyle, useChartTheme } from '@/hooks/useChartTheme';

interface PaymentTrendsChartsProps {
  trends: PaymentAnalytics['trends'];
}

export default function PaymentTrendsCharts({ trends }: PaymentTrendsChartsProps) {
  const theme = useChartTheme();
  const tip = chartTooltipStyle(theme);
  const hasData = useMemo(() => trends.some((t) => t.revenue > 0 || t.orders > 0), [trends]);

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trends</CardTitle>
          <CardDescription>No trend data for this period yet</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-8 text-center">
            Charts will appear once you have payment activity in the selected range.
          </p>
        </CardContent>
      </Card>
    );
  }

  const axis = { fontSize: 11, fill: theme.axis };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Revenue over time</CardTitle>
          <CardDescription>Completed order revenue by day</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trends}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.c2} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={theme.c2} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
              <XAxis dataKey="label" tick={axis} />
              <YAxis tick={axis} width={48} />
              <Tooltip contentStyle={tip} formatter={(v: number) => formatRon(v)} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={theme.c2}
                fill="url(#revFill)"
                strokeWidth={2}
                name="Revenue"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Orders over time</CardTitle>
          <CardDescription>Orders completed each day</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
              <XAxis dataKey="label" tick={axis} />
              <YAxis allowDecimals={false} tick={axis} width={32} />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="orders" fill={theme.c3} radius={[4, 4, 0, 0]} name="Orders" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Card vs Cash</CardTitle>
          <CardDescription>Revenue mix over time</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
              <XAxis dataKey="label" tick={axis} />
              <YAxis tick={axis} width={48} />
              <Tooltip contentStyle={tip} formatter={(v: number) => formatRon(v)} />
              <Legend wrapperStyle={{ color: theme.axis }} />
              <Area
                type="monotone"
                dataKey="cardRevenue"
                stackId="1"
                stroke={theme.c3}
                fill={theme.c3}
                fillOpacity={0.35}
                name="Card"
              />
              <Area
                type="monotone"
                dataKey="cashRevenue"
                stackId="1"
                stroke={theme.c4}
                fill={theme.c4}
                fillOpacity={0.35}
                name="Cash"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Payment success rate</CardTitle>
          <CardDescription>Daily completed vs failed/expired</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
              <XAxis dataKey="label" tick={axis} />
              <YAxis domain={[0, 100]} tick={axis} width={36} unit="%" />
              <Tooltip contentStyle={tip} formatter={(v: number) => `${Number(v).toFixed(1)}%`} />
              <Line
                type="monotone"
                dataKey="successRate"
                stroke={theme.c2}
                strokeWidth={2}
                dot={false}
                name="Success %"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
