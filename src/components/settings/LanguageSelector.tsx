import { useLanguage } from '@/i18n/LanguageProvider';
import { useTranslation } from 'react-i18next';
import type { AppLanguage } from '@/i18n/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const OPTIONS: { value: AppLanguage; labelKey: string }[] = [
  { value: 'ro', labelKey: 'language.ro' },
  { value: 'en', labelKey: 'language.en' },
];

export function LanguageSelector() {
  const { t } = useTranslation('settings');
  const { language, setLanguage } = useLanguage();

  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('language.title')}>
      {OPTIONS.map(({ value, labelKey }) => {
        const selected = language === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={async () => {
              if (value === language) return;
              try {
                await setLanguage(value);
                toast.success(t('language.saved'));
              } catch {
                toast.error(t('language.saveFailed'));
              }
            }}
            className={cn(
              'relative flex items-center gap-3 rounded-xl border p-4 text-left transition-all',
              'hover:border-primary/40 hover:bg-muted/40',
              selected
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                : 'border-border bg-card'
            )}
          >
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-primary' : 'border-muted-foreground/40'
              )}
            >
              {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
            <span className="font-medium text-sm">{t(labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
