// PROTECTED: money formatting for presentation components.
export function formatPrice(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}
