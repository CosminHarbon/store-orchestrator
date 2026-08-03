import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/** Compact header toggle — cycles or opens menu for Light / Dark / System. */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const OPTIONS = [
    { value: 'light' as const, label: t('themeLight'), icon: Sun },
    { value: 'dark' as const, label: t('themeDark'), icon: Moon },
    { value: 'system' as const, label: t('themeSystem'), icon: Monitor },
  ];

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn('h-10 w-10 rounded-full', className)}
        aria-label={t('theme')}
      >
        <Sun className="h-4 w-4 opacity-40" />
      </Button>
    );
  }

  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-10 w-10 rounded-full hover:bg-muted/60 transition-colors',
            className
          )}
          aria-label={t('themeChange')}
        >
          <CurrentIcon className="h-4 w-4 transition-transform duration-300" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => {
              document.documentElement.classList.add('theme-transition');
              setTheme(value);
              window.setTimeout(
                () => document.documentElement.classList.remove('theme-transition'),
                300
              );
            }}
            className={cn(
              'cursor-pointer gap-2',
              theme === value && 'bg-muted font-medium'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
