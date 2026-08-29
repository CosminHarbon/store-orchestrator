export const PENDING_ORDER_STORAGE_KEY = 'sv-open-order-id';

export function requestOpenOrder(orderId: string): void {
  const id = String(orderId || '').trim();
  if (!id) return;
  try {
    localStorage.setItem(PENDING_ORDER_STORAGE_KEY, id);
    localStorage.setItem('activeTab', 'orders');
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new CustomEvent('sv:navigate-tab', { detail: 'orders' }));
  window.dispatchEvent(new CustomEvent('sv:open-order', { detail: id }));
}

export function requestOpenReviews(): void {
  try {
    localStorage.setItem('activeTab', 'reviews');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('sv:navigate-tab', { detail: 'reviews' }));
}
