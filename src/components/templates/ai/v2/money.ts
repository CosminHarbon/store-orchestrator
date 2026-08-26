/** Format money for V2 presentation — never hardcode RON in the component chrome. */
export function formatStoreMoney(
  amount: number,
  currency = 'EUR',
  locale = 'en-EU'
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export type PresentationMode = 'luxury' | 'street' | 'tech' | 'editorial';

export function resolvePresentationMode(
  archetype: string,
  explicit?: unknown
): PresentationMode {
  if (explicit === 'luxury' || explicit === 'street' || explicit === 'tech' || explicit === 'editorial') {
    return explicit;
  }
  if (/luxury|quiet|artisan|editorial_luxury/i.test(archetype)) return 'luxury';
  if (/urban|street|drop/i.test(archetype)) return 'street';
  if (/tech|clinical|precision/i.test(archetype)) return 'tech';
  return 'editorial';
}
