import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  type PermissionStatus,
  type PushNotificationSchema,
  type ActionPerformed,
  type Token,
} from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { getOrCreateDeviceId } from './deviceId';
import { handleNotificationAction } from './handleNotificationAction';
import { pushLog } from './logger';
import type { NotificationDataPayload, PushPermissionStatus, PushPlatform } from './types';

let listenersAttached = false;
let currentToken: string | null = null;
let registrationInFlight: Promise<string | null> | null = null;

function mapPermission(status: PermissionStatus): PushPermissionStatus {
  const receive = status.receive;
  if (receive === 'granted') return 'granted';
  if (receive === 'denied') return 'denied';
  if (receive === 'prompt' || receive === 'prompt-with-rationale') return 'prompt';
  return 'unavailable';
}

export function isNativePushAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications');
}

export function getPushPlatform(): PushPlatform | null {
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' || platform === 'android') return platform;
  return null;
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (!isNativePushAvailable()) return 'unavailable';
  try {
    const status = await PushNotifications.checkPermissions();
    return mapPermission(status);
  } catch (error) {
    pushLog.error('Permission status check failed', error);
    return 'unavailable';
  }
}

/** Request OS permission. Does not register listeners or save tokens by itself. */
export async function requestPushPermission(): Promise<PushPermissionStatus> {
  if (!isNativePushAvailable()) {
    pushLog.info('Permission: unavailable (not native)');
    return 'unavailable';
  }

  try {
    let status = await PushNotifications.checkPermissions();
    let mapped = mapPermission(status);
    pushLog.info(`Permission: ${mapped}`);

    if (mapped === 'prompt') {
      status = await PushNotifications.requestPermissions();
      mapped = mapPermission(status);
      pushLog.info(`Permission after request: ${mapped}`);
    }

    return mapped;
  } catch (error) {
    pushLog.error('Permission request failed', error);
    return 'unavailable';
  }
}

export function getPushToken(): string | null {
  return currentToken;
}

async function saveTokenToSupabase(token: string, platform: PushPlatform): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    pushLog.warn('No authenticated session — skipping token save');
    return;
  }

  const deviceId = getOrCreateDeviceId();

  // Prefer Edge Function (service role upsert) so a device can move between merchants safely.
  const { error } = await supabase.functions.invoke('register-push-token', {
    body: {
      token,
      platform,
      device_id: deviceId,
      provider: 'fcm',
    },
  });

  if (error) {
    pushLog.error('Token save via Edge Function failed — trying direct upsert', error);

    const { error: upsertError } = await supabase.from('push_tokens').upsert(
      {
        user_id: session.user.id,
        device_token: token,
        platform,
        device_id: deviceId,
        provider: 'fcm',
        is_active: true,
        onesignal_player_id: null,
      },
      { onConflict: 'device_token' }
    );

    if (upsertError) {
      pushLog.error('Token save failed', upsertError);
      throw upsertError;
    }
  }

  pushLog.info('Token saved', { token, platform, deviceId });
}

function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  void PushNotifications.addListener('registration', (token: Token) => {
    currentToken = token.value;
    pushLog.info('Token received', { token: token.value });
    const platform = getPushPlatform();
    if (platform) {
      void saveTokenToSupabase(token.value, platform).catch(() => {
        /* non-blocking */
      });
    }
  });

  void PushNotifications.addListener('registrationError', (error) => {
    pushLog.error('Registration error', error);
  });

  void PushNotifications.addListener(
    'pushNotificationReceived',
    (notification: PushNotificationSchema) => {
      pushLog.info('Notification received (foreground)', {
        title: notification.title,
        id: notification.id,
      });
      // No business actions — infrastructure only.
    }
  );

  void PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action: ActionPerformed) => {
      pushLog.info('Notification tapped');
      handleNotificationAction({
        title: action.notification.title,
        body: action.notification.body,
        data: action.notification.data as NotificationDataPayload,
      });
    }
  );
}

/**
 * Full native registration flow (permission → register → token → Supabase).
 * Safe to call multiple times; no-ops on web. Never throws to callers.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!isNativePushAvailable()) {
    pushLog.info('Skip register — not a native Capacitor runtime');
    return null;
  }

  if (registrationInFlight) return registrationInFlight;

  registrationInFlight = (async () => {
    try {
      attachListeners();

      const permission = await requestPushPermission();
      if (permission !== 'granted') {
        pushLog.warn('Not registering — permission not granted');
        return null;
      }

      pushLog.info('Registered — requesting device token');
      await PushNotifications.register();

      // Token arrives asynchronously via `registration` listener.
      return currentToken;
    } catch (error) {
      pushLog.error('registerForPushNotifications failed', error);
      return null;
    } finally {
      registrationInFlight = null;
    }
  })();

  return registrationInFlight;
}

/** Soft-deactivate / remove this device's FCM token for the current user. */
export async function unregisterPushToken(): Promise<void> {
  if (!isNativePushAvailable()) return;

  try {
    const deviceId = getOrCreateDeviceId();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      currentToken = null;
      return;
    }

    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', session.user.id)
      .eq('provider', 'fcm')
      .eq('device_id', deviceId);

    if (error) {
      // Fallback: delete by token if we still have it
      if (currentToken) {
        await supabase
          .from('push_tokens')
          .delete()
          .eq('user_id', session.user.id)
          .eq('device_token', currentToken);
      } else {
        pushLog.error('Unregister failed', error);
      }
    } else {
      pushLog.info('Token association removed on logout');
    }
  } catch (error) {
    pushLog.error('unregisterPushToken failed', error);
  } finally {
    currentToken = null;
  }
}

/** Authenticated self-test only. */
export async function sendTestPush(): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-test-push', {
      body: {
        title: 'SpeedVendors test notification',
        body: 'Push infrastructure is working on this device.',
        data: { type: 'test', id: 'self-test' },
      },
    });

    if (error) {
      pushLog.error('sendTestPush failed', error);
      return { success: false, error: error.message };
    }

    pushLog.info('sendTestPush ok', data as Record<string, unknown>);
    return { success: true };
  } catch (error) {
    pushLog.error('sendTestPush exception', error);
    return { success: false, error: String(error) };
  }
}

export { handleNotificationAction };
