import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';

/** Resolve design-token chart colors for Recharts (adapts to light/dark). */
export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick((t) => t + 1);
  }, [resolvedTheme]);

  return useMemo(() => {
    void tick;
    const read = (name: string, fallback: string) => {
      if (typeof window === 'undefined') return fallback;
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v ? `hsl(${v})` : fallback;
    };

    return {
      grid: read('--chart-grid', 'hsl(220 13% 91%)'),
      axis: read('--chart-axis', 'hsl(215 16% 47%)'),
      c1: read('--chart-1', 'hsl(262 83% 58%)'),
      c2: read('--chart-2', 'hsl(173 58% 39%)'),
      c3: read('--chart-3', 'hsl(197 72% 45%)'),
      c4: read('--chart-4', 'hsl(43 74% 49%)'),
      c5: read('--chart-5', 'hsl(27 87% 55%)'),
      tooltipBg: read('--card', 'hsl(0 0% 100%)'),
      tooltipBorder: read('--border', 'hsl(220 13% 91%)'),
      tooltipFg: read('--card-foreground', 'hsl(222 47% 11%)'),
      cursor: read('--muted', 'hsl(220 14% 96%)'),
    };
  }, [tick]);
}

export const chartTooltipStyle = (theme: ReturnType<typeof useChartTheme>) => ({
  backgroundColor: theme.tooltipBg,
  border: `1px solid ${theme.tooltipBorder}`,
  borderRadius: 8,
  color: theme.tooltipFg,
  fontSize: 12,
});
