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
import type { ProductAnalytics } from '@/lib/productAnalytics';
import { formatRon } from '@/lib/productAnalytics';

const COLORS = ['hsl(160 50% 40%)', 'hsl(32 80% 50%)', 'hsl(0 70% 55%)', 'hsl(215 50% 45%)'];

interface ProductTrendsChartsProps {
  analytics: ProductAnalytics;
}

export default function ProductTrendsCharts({ analytics }: ProductTrendsChartsProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Products added over time</CardTitle>
          <CardDescription>Catalog growth by month</CardDescription>
        </CardHeader>
        <CardContent className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.productsAddedOverTime}>
              <defs>
                <linearGradient id="prodAdd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(215 55% 45%)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(215 55% 45%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="count"
                stroke="hsl(215 55% 40%)"
                fill="url(#prodAdd)"
                name="Products"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Stock distribution</CardTitle>
          <CardDescription>Inventory health snapshot</CardDescription>
        </CardHeader>
        <CardContent className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={analytics.inventoryDistribution}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={3}
              >
                {analytics.inventoryDistribution.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sales by product</CardTitle>
          <CardDescription>Units sold (top products)</CardDescription>
        </CardHeader>
        <CardContent className="h-[240px]">
          {analytics.salesByProduct.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.salesByProduct}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis dataKey="title" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={55} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                <Tooltip />
                <Bar dataKey="units" fill="hsl(215 50% 45%)" radius={[4, 4, 0, 0]} name="Units" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="Sales charts unlock after orders include products." />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Revenue by product</CardTitle>
          <CardDescription>Top revenue contributors</CardDescription>
        </CardHeader>
        <CardContent className="h-[240px]">
          {analytics.salesByProduct.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.salesByProduct}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis dataKey="title" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={55} />
                <YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip formatter={(v: number) => formatRon(v)} />
                <Bar dataKey="revenue" fill="hsl(160 50% 40%)" radius={[4, 4, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="Revenue charts unlock after product sales." />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 xl:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Revenue by category</CardTitle>
          <CardDescription>Category performance from order history</CardDescription>
        </CardHeader>
        <CardContent className="h-[240px]">
          {analytics.categorySales.some((c) => c.revenue > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.categorySales}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip formatter={(v: number) => formatRon(v)} />
                <Bar dataKey="revenue" fill="hsl(32 75% 48%)" radius={[4, 4, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="Category revenue appears once products start selling." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-6">
      {text}
    </div>
  );
}
