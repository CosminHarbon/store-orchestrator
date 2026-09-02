import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useMediaUsage } from '@/hooks/useMediaUsage';
import { formatBytes } from '@/lib/media/constants';

function tierLabel(
  t: (key: string) => string,
  tier: string,
): string {
  if (tier === 'growth') return t('saasBilling.storage.tierGrowth');
  if (tier === 'scale') return t('saasBilling.storage.tierScale');
  if (tier === 'start') return t('saasBilling.storage.tierStart');
  return tier;
}

export function MediaStorageCard() {
  const { t } = useTranslation('settings');
  const { data, isLoading } = useMediaUsage();
  const used = data?.bytes_used || 0;
  const quota = data?.quota_bytes || 0;
  const percent = Math.min(100, data?.percent || 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('saasBilling.storage.title')}</CardTitle>
        <CardDescription>{t('saasBilling.storage.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">{t('saasBilling.loading')}</p>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {t('saasBilling.storage.usedOf', {
                  used: formatBytes(used),
                  quota: formatBytes(quota),
                })}
              </span>
              <span className="text-muted-foreground capitalize">{tierLabel(t, data.tier)}</span>
            </div>
            <Progress value={percent} className="h-2" />
            <p className="text-xs text-muted-foreground">{Math.round(percent)}%</p>
            {percent >= 100 ? (
              <p className="text-sm text-destructive">{t('saasBilling.storage.full')}</p>
            ) : percent >= 95 ? (
              <p className="text-sm text-destructive">{t('saasBilling.storage.almostFull')}</p>
            ) : percent >= 80 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">{t('saasBilling.storage.low')}</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
