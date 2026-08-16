import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_STORAGE_KEY, isAppLanguage, type AppLanguage } from '@/i18n/types';
import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';

type Props = {
  className?: string;
  compact?: boolean;
  style?: CSSProperties;
};

export function StorefrontLanguageToggle({ className, compact, style }: Props) {
  const { t, i18n } = useTranslation('storefront');
  const language: AppLanguage = isAppLanguage(i18n.language) ? i18n.language : 'en';

  const toggle = () => {
    const next: AppLanguage = language === 'ro' ? 'en' : 'ro';
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    void i18n.changeLanguage(next);
    document.documentElement.lang = next;
  };

  return (
    <button
      type="button"
      onClick={toggle}
      style={style}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase transition hover:opacity-80',
        className
      )}
      aria-label={t('language.toggle')}
      title={t('language.toggle')}
    >
      <Globe className="h-3.5 w-3.5" strokeWidth={1.5} />
      {compact ? (language === 'ro' ? 'RO' : 'EN') : language === 'ro' ? t('language.ro') : t('language.en')}
    </button>
  );
}
