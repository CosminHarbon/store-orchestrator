import type { NotificationDataPayload } from './types';
import { requestOpenOrder, requestOpenReviews } from './navigation';
import { pushLog } from './logger';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** FCM / Capacitor may nest or stringify data. Flatten to our payload shape. */
export function normalizeNotificationData(
  raw: NotificationDataPayload | Record<string, unknown> | string | undefined | null,
): NotificationDataPayload {
  const root = asRecord(raw) || {};
  const nested = asRecord(root.data) || {};
  const merged: Record<string, unknown> = { ...nested, ...root };
  const out: NotificationDataPayload = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value == null) continue;
    out[key] = String(value);
  }
  return out;
}

/**
 * Notification tap / open handler.
 * Persists the target first so a cold start cannot lose order_id, then navigates.
 */
export function handleNotificationAction(notification: {
  title?: string;
  body?: string;
  data?: NotificationDataPayload | Record<string, unknown> | string;
}): void {
  const data = normalizeNotificationData(notification.data);
  const orderId = data.order_id || (data.type === 'order' ? data.id : undefined);
  pushLog.info('Notification tapped', {
    type: data.type,
    id: orderId || data.review_id || data.product_id,
    title: notification.title,
  });

  if (data.type === 'order' && orderId) {
    requestOpenOrder(orderId);
    return;
  }
  if (data.type === 'review') {
    requestOpenReviews();
  }
}
