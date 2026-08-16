import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import logoMark from '@/assets/brand/logo-mark.svg';
import logoMarkOnLight from '@/assets/brand/logo-mark-on-light.svg';
import logoMarkOnDark from '@/assets/brand/logo-mark-on-dark.svg';
import logoHorizontalOnLight from '@/assets/brand/logo-horizontal-on-light.svg';
import logoHorizontalOnDark from '@/assets/brand/logo-horizontal-on-dark.svg';

export type BrandLogoVariant = 'mark' | 'horizontal';

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  /** Force surface regardless of app theme (e.g. always-dark hero). */
  surface?: 'auto' | 'light' | 'dark';
  className?: string;
  imgClassName?: string;
  alt?: string;
};

function resolveSurface(
  surface: 'auto' | 'light' | 'dark',
  resolvedTheme: string | undefined,
  mounted: boolean
): 'light' | 'dark' {
  if (surface === 'light' || surface === 'dark') return surface;
  if (!mounted) return 'light';
  return resolvedTheme === 'dark' ? 'dark' : 'light';
}

/**
 * Official SpeedVendors logo from /Branding.
 * Light-surface assets for light UI; dark-surface assets for dark UI.
 */
export function BrandLogo({
  variant = 'mark',
  surface = 'auto',
  className,
  imgClassName,
  alt,
}: BrandLogoProps) {
  const { t } = useTranslation('common');
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const mode = resolveSurface(surface, resolvedTheme, mounted);
  const src =
    variant === 'horizontal'
      ? mode === 'dark'
        ? logoHorizontalOnDark
        : logoHorizontalOnLight
      : mode === 'dark'
        ? logoMarkOnDark
        : logoMarkOnLight;

  return (
    <span className={cn('inline-flex items-center justify-center', className)}>
      <img
        src={src}
        alt={alt ?? t('brandLogoAlt')}
        className={cn('object-contain', imgClassName)}
        draggable={false}
      />
    </span>
  );
}

/** Transparent gradient mark — safe on both light and dark when no theme context. */
export function BrandMarkTransparent({
  className,
  imgClassName,
  alt,
}: {
  className?: string;
  imgClassName?: string;
  alt?: string;
}) {
  const { t } = useTranslation('common');
  return (
    <span className={cn('inline-flex items-center justify-center', className)}>
      <img
        src={logoMark}
        alt={alt ?? t('brandLogoAlt')}
        className={cn('object-contain', imgClassName)}
        draggable={false}
      />
    </span>
  );
}
