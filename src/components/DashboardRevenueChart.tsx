import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';

interface Props {
  data: { date: string; sales: number; orders: number }[];
  metric: 'sales' | 'orders';
  emptyLabel: string;
}

export default function DashboardRevenueChart({ data, metric, emptyLabel }: Props) {
  if (!data.length) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: format(new Date(d.date), 'dd MMM'),
  }));

  const color = metric === 'sales' ? '#6E3DFF' : '#4B21B6';
  const tooltipLabel = metric === 'sales' ? 'Sales' : 'Orders';
  const dataKey = metric === 'sales' ? 'sales' : 'orders';

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="svRevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.26} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(148, 163, 184, 0.15)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'rgba(100, 116, 139, 0.9)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'rgba(100, 116, 139, 0.9)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) =>
            metric === 'sales'
              ? v >= 1000
                ? `${(v / 1000).toFixed(0)}k`
                : String(v)
              : String(v)
          }
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(13, 7, 23, 0.96)',
            border: '1px solid rgba(110, 61, 255, 0.18)',
            borderRadius: 14,
            color: '#fff',
            fontSize: 12,
          }}
          formatter={(value: number) => [
            metric === 'sales' ? `${value.toFixed(2)} RON` : value,
            tooltipLabel,
          ]}
          labelFormatter={(label) => label}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill="url(#svRevGrad)"
          dot={false}
          activeDot={{ r: 4, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
