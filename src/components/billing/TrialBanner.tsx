import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTrialStatus, type TrialLevel } from '@/hooks/useTrialStatus';

const TONE: Partial<Record<TrialLevel, string>> = {
  notice: 'bg-sky-500/10 border-sky-500/30',
  warning: 'bg-amber-500/15 border-amber-500/40',
  urgent: 'bg-orange-500/15 border-orange-500/50',
  expired: 'bg-destructive/10 border-destructive/40',
};

function dismissKey(level: TrialLevel): string {
  return `sv-trial-banner-dismissed:${level}:${new Date().toISOString().slice(0, 10)}`;
}

function readDismissed(level: TrialLevel): boolean {
  try {
    return localStorage.getItem(dismissKey(level)) === '1';
  } catch {
    return false;
  }
}

/**
 * Slim app-wide trial banner.
 *  - >3 days left: not shown (status lives in Settings → Billing).
 *  - 3 days / 1 day: dismissible for the rest of the day.
 *  - final 24h and expired: persistent.
 * The expired state also tells the user the store is read-only and points to plans.
 */
export function TrialBanner() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const trial = useTrialStatus();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed(trial.level));
  }, [trial.level]);

  const level = trial.level;
  if (level === 'none' || level === 'calm') return null;
  if (dismissed && (level === 'notice' || level === 'warning')) return null;

  const expired = level === 'expired';
  const persistent = level === 'urgent' || expired;

  let message: string;
  if (expired) {
    message = `${t('trial.endedTitle')} ${t('trial.endedBody')}`;
  } else if (level === 'urgent') {
    message = `${t('trial.lastDay', { time: t('trial.hoursRemaining', { count: Math.max(1, trial.hoursLeft) }) })} ${t('trial.keepRunning')}`;
  } else if (level === 'warning') {
    message = `${t('trial.endsTomorrow')} ${t('trial.keepRunning')}`;
  } else {
    message = t('trial.endsInBanner', { count: trial.daysLeft });
  }

  return (
    <div
      role={expired ? 'alert' : 'status'}
      data-trial-level={level}
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-sm',
        TONE[level],
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        {expired ? (
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        )}
        <span className="min-w-0">{message}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant={level === 'notice' ? 'outline' : 'default'} onClick={() => navigate('/subscribe')}>
          {t('trial.choosePlan')}
        </Button>
        {!persistent ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={t('trial.dismiss')}
            onClick={() => {
              try {
                localStorage.setItem(dismissKey(level), '1');
              } catch {
                /* ignore */
              }
              setDismissed(true);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
