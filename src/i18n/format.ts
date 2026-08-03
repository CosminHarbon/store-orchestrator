import i18n from './index';
import { toIntlLocale, type AppLanguage, isAppLanguage } from './types';

function activeLang(): AppLanguage {
  const lng = (i18n.resolvedLanguage || i18n.language || 'ro').split('-')[0];
  return isAppLanguage(lng) ? lng : 'ro';
}

function locale(lang?: AppLanguage): string {
  return toIntlLocale(lang ?? activeLang());
}

export function formatCurrency(
  amount: number,
  currency = 'RON',
  lang?: AppLanguage
): string {
  return new Intl.NumberFormat(locale(lang), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  lang?: AppLanguage
): string {
  return new Intl.NumberFormat(locale(lang), options).format(value);
}

export function formatDate(
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
  lang?: AppLanguage
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  }).format(date);
}

export function formatDateTime(
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
  lang?: AppLanguage
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(date);
}

export function formatShortDate(
  value: Date | string | number,
  lang?: AppLanguage
): string {
  return formatDate(value, { day: 'numeric', month: 'short', year: 'numeric' }, lang);
}
