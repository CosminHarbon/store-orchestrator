/** Structured notification deep-link payload (infrastructure only — routing later). */
export type NotificationDeepLinkType =
  | 'order'
  | 'payment'
  | 'product'
  | 'dashboard'
  | 'settings'
  | 'test'
  | string;

export type PushPlatform = 'ios' | 'android';

export type PushPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unavailable';

export type NotificationDataPayload = {
  type?: NotificationDeepLinkType;
  id?: string;
  order_id?: string;
  product_id?: string;
  [key: string]: string | undefined;
};

export type PushProvider = 'fcm' | 'onesignal';
