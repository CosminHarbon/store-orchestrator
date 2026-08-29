/** Structured notification deep-link payload. */
export type NotificationDeepLinkType =
  | 'order'
  | 'payment'
  | 'product'
  | 'dashboard'
  | 'settings'
  | 'review'
  | 'test'
  | string;

export type PushPlatform = 'ios' | 'android';

export type PushPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unavailable';

export type NotificationDataPayload = {
  type?: NotificationDeepLinkType;
  event?: string;
  id?: string;
  order_id?: string;
  product_id?: string;
  review_id?: string;
  [key: string]: string | undefined;
};

export type PushProvider = 'fcm' | 'onesignal';
