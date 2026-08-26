import type { CSSProperties } from 'react';
import type { BrandDesignSystem, DesignTokens } from './designSpec';

/** Map BrandDesignSystem tokens → CSS variables for the V2 renderer. */
export function brandTokensToCssVars(system: BrandDesignSystem): CSSProperties {
  const t = system.tokens;
  return {
    ['--ai-primary' as string]: t.primary,
    ['--ai-bg' as string]: t.background,
    ['--ai-text' as string]: t.text,
    ['--ai-accent' as string]: t.accent,
    ['--ai-secondary' as string]: t.secondary,
    ['--ai-heading' as string]: t.headingFont,
    ['--ai-body' as string]: t.bodyFont,
    ['--ai-radius' as string]:
      t.radius === 'sharp' ? '0px' : t.radius === 'pill' ? '999px' : t.radius === 'rounded' ? '1rem' : '0.75rem',
    ['--ai-shadow' as string]:
      t.shadow === 'none' ? 'none' : t.shadow === 'lift' ? '0 18px 50px rgba(0,0,0,.12)' : '0 8px 30px rgba(0,0,0,.08)',
    ['--ai-density' as string]: t.density,
    background: t.background,
    color: t.text,
    fontFamily: `${t.bodyFont}, system-ui, sans-serif`,
  } as CSSProperties;
}

export function mergeTokenOverrides(base: DesignTokens, override?: Partial<DesignTokens>): DesignTokens {
  return { ...base, ...(override || {}) };
}
