import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

type ScopedThemeProviderProps = {
  children: ReactNode;
  /** localStorage key — must differ per surface so themes never leak */
  storageKey: string;
  defaultTheme?: 'light' | 'dark' | 'system';
};

/**
 * Scoped next-themes wrapper. Each surface (marketing / app / storefront)
 * must use a unique storageKey so Light/Dark never cross-contaminates.
 */
export function ScopedThemeProvider({
  children,
  storageKey,
  defaultTheme = 'light',
}: ScopedThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem
      storageKey={storageKey}
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  );
}

/** Merchant dashboard, Auth, Setup — isolated from landing & storefronts */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  return <ScopedThemeProvider storageKey="sv-app-theme">{children}</ScopedThemeProvider>;
}

/** SpeedVendors marketing homepage only */
export function MarketingThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ScopedThemeProvider storageKey="sv-marketing-theme">{children}</ScopedThemeProvider>
  );
}

/** Customer-facing /templates/:id storefronts */
export function StorefrontThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ScopedThemeProvider storageKey="sv-storefront-theme">{children}</ScopedThemeProvider>
  );
}

/** @deprecated Use AppThemeProvider — kept as alias for existing imports */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <AppThemeProvider>{children}</AppThemeProvider>;
}
