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

interface PaymentTrendsChartsProps {
  trends: PaymentAnalytics['trends'];
}

export default function PaymentTrendsCharts({ trends }: PaymentTrendsChartsProps) {
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
                  <stop offset="0%" stopColor="hsl(160 60% 40%)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(160 60% 40%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={48} />
              <Tooltip formatter={(v: number) => formatRon(v)} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(160 60% 35%)"
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
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
              <Tooltip />
              <Bar dataKey="orders" fill="hsl(215 50% 45%)" radius={[4, 4, 0, 0]} name="Orders" />
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
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={48} />
              <Tooltip formatter={(v: number) => formatRon(v)} />
              <Legend />
              <Area
                type="monotone"
                dataKey="cardRevenue"
                stackId="1"
                stroke="hsl(215 55% 45%)"
                fill="hsl(215 55% 45% / 0.35)"
                name="Card"
              />
              <Area
                type="monotone"
                dataKey="cashRevenue"
                stackId="1"
                stroke="hsl(32 80% 45%)"
                fill="hsl(32 80% 45% / 0.35)"
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
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={36} unit="%" />
              <Tooltip formatter={(v: number) => `${Number(v).toFixed(1)}%`} />
              <Line
                type="monotone"
                dataKey="successRate"
                stroke="hsl(160 55% 38%)"
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
