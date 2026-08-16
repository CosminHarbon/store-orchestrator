import type { NotificationDataPayload } from './types';
import { pushLog } from './logger';

/**
 * Notification tap / open handler.
 * Deep-link navigation (orders, payments, etc.) will be wired in a later task.
 */
export function handleNotificationAction(notification: {
  title?: string;
  body?: string;
  data?: NotificationDataPayload | Record<string, unknown>;
}): void {
  const data = (notification.data || {}) as NotificationDataPayload;
  pushLog.info('Notification tapped', {
    type: data.type,
    id: data.id || data.order_id || data.product_id,
    title: notification.title,
  });

  // Intentionally no navigation yet — infrastructure only.
  void data;
}
