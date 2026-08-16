import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';

export function StorefrontDemoBanner({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const { t } = useTranslation('storefront');
  return (
    <div
      className={cn(
        'sticky top-0 z-[60] border-b px-4 py-2 text-center text-xs md:text-sm',
        className
      )}
      style={style}
    >
      <span className="inline-flex items-center gap-2 font-medium">
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        {t('demo.banner')}
      </span>
    </div>
  );
}
