import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTrialStatus, type TrialLevel } from '@/hooks/useTrialStatus';
import { toIntlLocale } from '@/i18n/types';
import type { AppLanguage } from '@/i18n/types';

const TONE: Record<TrialLevel, string> = {
  none: '',
  calm: 'border-border/70 bg-muted/40',
  notice: 'border-sky-500/30 bg-sky-500/10',
  warning: 'border-amber-500/40 bg-amber-500/10',
  urgent: 'border-orange-500/50 bg-orange-500/10',
  expired: 'border-destructive/40 bg-destructive/10',
};

/**
 * Settings → Billing state for an explicitly-started free trial:
 *
 *   Free Trial
 *   5 days remaining
 *   Trial ends: September 25, 2026
 *   [Choose a plan]
 *
 * The end date and the countdown come from the server-side trial row (never local storage).
 * "Choose a plan" opens the SpeedVendors plan-selection screen — a trial has no Stripe subscription
 * to manage, so it must not open the Stripe Customer Portal.
 */
export function TrialStatusCard() {
  const { t, i18n } = useTranslation('common');
  const navigate = useNavigate();
  const trial = useTrialStatus();
  const locale = toIntlLocale((i18n.language === 'en' ? 'en' : 'ro') as AppLanguage);

  if (trial.level === 'none') return null;

  const expired = trial.level === 'expired';
  const endDate = trial.endsAt
    ? trial.endsAt.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const remaining =
    trial.level === 'urgent'
      ? t('trial.hoursRemaining', { count: Math.max(1, trial.hoursLeft) })
      : t('trial.daysRemaining', { count: trial.daysLeft });
  const prominentCta = trial.level !== 'calm';

  return (
    <div className={cn('space-y-3 rounded-lg border p-4', TONE[trial.level])} data-trial-level={trial.level}>
      <div className="flex items-start gap-3">
        {expired ? (
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
        ) : (
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="min-w-0 space-y-1">
          {expired ? (
            <p className="font-semibold">{t('trial.endedMessage')}</p>
          ) : (
            <>
              <p className="font-semibold">{t('trial.title')}</p>
              <p className="text-lg font-semibold leading-tight">{remaining}</p>
              <p className="text-sm text-muted-foreground">
                {t('trial.endsLabel')} <span className="font-medium text-foreground">{endDate}</span>
              </p>
            </>
          )}
        </div>
      </div>
      <Button
        size={prominentCta ? 'default' : 'sm'}
        variant={prominentCta ? 'default' : 'outline'}
        className={prominentCta ? 'w-full sm:w-auto' : undefined}
        onClick={() => navigate('/subscribe')}
      >
        {t('trial.choosePlan')}
      </Button>
    </div>
  );
}
