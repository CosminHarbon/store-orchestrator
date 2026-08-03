export const SUPPORTED_LANGUAGES = ['ro', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: AppLanguage = 'ro';

export const LANGUAGE_STORAGE_KEY = 'sv_preferred_language';

export const I18N_NAMESPACES = [
  'common',
  'dashboard',
  'orders',
  'products',
  'customers',
  'payments',
  'settings',
  'reviews',
  'analytics',
  'stock',
  'templates',
  'collections',
  'discounts',
  'shipping',
  'checkout',
  'auth',
  'validation',
] as const;

export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'ro' || value === 'en';
}

/** BCP 47 locale tag for Intl / date-fns */
export function toIntlLocale(lang: AppLanguage): string {
  return lang === 'ro' ? 'ro-RO' : 'en-US';
}
