import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** Settings appearance selector — Light / Dark / System. */
export function ThemeSelector() {
  const { t } = useTranslation('common');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const OPTIONS = [
    {
      value: 'light' as const,
      label: t('themeLight'),
      description: t('themeLightDesc'),
      icon: Sun,
    },
    {
      value: 'dark' as const,
      label: t('themeDark'),
      description: t('themeDarkDesc'),
      icon: Moon,
    },
    {
      value: 'system' as const,
      label: t('themeSystem'),
      description: t('themeSystemDesc'),
      icon: Monitor,
    },
  ];

  const active = mounted ? theme || 'light' : 'light';

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {OPTIONS.map(({ value, label, description, icon: Icon }) => {
        const selected = active === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => {
              document.documentElement.classList.add('theme-transition');
              setTheme(value);
              window.setTimeout(
                () => document.documentElement.classList.remove('theme-transition'),
                300
              );
            }}
            className={cn(
              'relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all',
              'hover:border-primary/40 hover:bg-muted/40',
              selected
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                : 'border-border bg-card'
            )}
          >
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg',
                selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <div className="font-medium text-sm">{label}</div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
            </div>
            {selected && (
              <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
