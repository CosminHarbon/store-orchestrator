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
import { handleNotificationAction, normalizeNotificationData } from './handleNotificationAction';
import { pushLog } from './logger';
import type { NotificationDataPayload, PushPermissionStatus, PushPlatform } from './types';

const CACHED_FCM_TOKEN_KEY = 'sv_last_fcm_token';

let listenersAttached = false;
let currentToken: string | null = null;
let registrationInFlight: Promise<string | null> | null = null;
let lastSaveError: string | null = null;
let lastSaveOk = false;
let tokenWaiters: Array<(token: string) => void> = [];

/** APNs device tokens are typically 64 hex chars. FCM tokens are longer / not pure hex. */
export function looksLikeApnsHexToken(token: string): boolean {
  return /^[0-9A-Fa-f]{64}$/.test(token.trim());
}

function readCachedFcmToken(): string | null {
  try {
    const value = localStorage.getItem(CACHED_FCM_TOKEN_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function writeCachedFcmToken(token: string): void {
  try {
    localStorage.setItem(CACHED_FCM_TOKEN_KEY, token);
  } catch {
    /* ignore quota / private mode */
  }
}

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

export type PushRegistrationState = {
  permission: PushPermissionStatus;
  hasLocalToken: boolean;
  tokenSaved: boolean;
  lastError: string | null;
  tokenLength: number | null;
};

export async function getPushRegistrationState(): Promise<PushRegistrationState> {
  const permission = await getPushPermissionStatus();
  const token = currentToken || readCachedFcmToken();
  return {
    permission,
    hasLocalToken: Boolean(token),
    tokenSaved: lastSaveOk,
    lastError: lastSaveError,
    tokenLength: token ? token.length : null,
  };
}

async function extractFunctionsErrorMessage(error: unknown, data: unknown): Promise<string> {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const parts = [d.error, d.message, d.hint, d.details].filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );
    if (parts.length) return parts.join(' — ');
  }

  if (error && typeof error === 'object') {
    const err = error as {
      message?: string;
      context?: Response;
      name?: string;
    };
    const ctx = err.context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body && typeof body === 'object') {
          const b = body as Record<string, unknown>;
          const parts = [b.error, b.message, b.hint, b.details].filter(
            (v): v is string => typeof v === 'string' && v.trim().length > 0,
          );
          if (parts.length) return parts.join(' — ');
        }
      } catch {
        /* ignore body parse */
      }
    }
    if (typeof err.message === 'string' && err.message.trim()) return err.message;
  }

  return 'Unknown push error';
}

function waitForRegistrationToken(timeoutMs: number): Promise<string | null> {
  if (currentToken) return Promise.resolve(currentToken);
  const cached = readCachedFcmToken();

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      resolve(currentToken || cached);
    }, timeoutMs);

    tokenWaiters.push((token) => {
      window.clearTimeout(timer);
      resolve(token);
    });
  });
}

/**
 * Associate the device FCM token with the currently authenticated SpeedVendors user.
 * Always goes through register-push-token (service role) so ownership can transfer
 * across accounts without weakening RLS.
 */
async function saveTokenToSupabase(token: string, platform: PushPlatform): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    lastSaveOk = false;
    lastSaveError = 'No authenticated session';
    pushLog.warn('No authenticated session — skipping token save');
    return;
  }

  if (platform === 'ios' && looksLikeApnsHexToken(token)) {
    lastSaveOk = false;
    lastSaveError =
      'Received APNs hex token instead of FCM token — rebuild with Firebase FCM AppDelegate wiring';
    pushLog.error('Rejecting APNs hex token on iOS (need FCM registration token)', {
      tokenLen: token.length,
    });
    return;
  }

  const deviceId = getOrCreateDeviceId();
  writeCachedFcmToken(token);

  const { data, error } = await supabase.functions.invoke('register-push-token', {
    body: {
      action: 'register',
      token,
      platform,
      device_id: deviceId,
      provider: 'fcm',
    },
  });

  if (error) {
    const message = await extractFunctionsErrorMessage(error, data);
    lastSaveOk = false;
    lastSaveError = message;
    // Do NOT fall back to direct client upsert: RLS prevents claiming another user's
    // row for the same device_token (push_tokens_device_token_uidx).
    pushLog.error('Token save via Edge Function failed', message);
    throw new Error(message);
  }

  lastSaveOk = true;
  lastSaveError = null;
  const transferred =
    data && typeof data === 'object' && (data as { transferred?: boolean }).transferred === true;
  pushLog.info('Token saved', {
    token,
    platform,
    deviceId,
    transferred: transferred || false,
  });
}

function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  void PushNotifications.addListener('registration', (token: Token) => {
    currentToken = token.value;
    writeCachedFcmToken(token.value);
    const waiters = tokenWaiters;
    tokenWaiters = [];
    waiters.forEach((resolve) => resolve(token.value));

    pushLog.info('Token received', { token: token.value });
    const platform = getPushPlatform();
    if (platform) {
      void saveTokenToSupabase(token.value, platform).catch(() => {
        /* non-blocking */
      });
    }
  });

  void PushNotifications.addListener('registrationError', (error) => {
    lastSaveOk = false;
    lastSaveError =
      error && typeof error === 'object' && 'error' in error
        ? String((error as { error: unknown }).error)
        : 'Registration error';
    pushLog.error('Registration error', error);
  });

  void PushNotifications.addListener(
    'pushNotificationReceived',
    (notification: PushNotificationSchema) => {
      const data = normalizeNotificationData(
        notification.data as NotificationDataPayload | Record<string, unknown> | undefined,
      );
      pushLog.info('Notification received (foreground)', {
        title: notification.title,
        id: notification.id,
        type: data.type,
      });
      window.dispatchEvent(
        new CustomEvent('sv:push-foreground', {
          detail: {
            title: notification.title,
            body: notification.body,
            data,
          },
        }),
      );
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

/** Attach native listeners immediately (before login) so cold-start taps are not lost. */
export function ensurePushListenersAttached(): void {
  if (!isNativePushAvailable()) return;
  attachListeners();
}

/**
 * Full native registration flow (permission → register → token → Supabase).
 * Safe to call multiple times; no-ops on web. Never throws to callers.
 *
 * On account switch the OS permission is already granted and the FCM string is often
 * unchanged — we still register() and always re-associate the token to the current user.
 */
export async function registerForPushNotifications(options?: {
  force?: boolean;
}): Promise<string | null> {
  if (!isNativePushAvailable()) {
    pushLog.info('Skip register — not a native Capacitor runtime');
    return null;
  }

  const force = Boolean(options?.force);

  if (!force && registrationInFlight) {
    return registrationInFlight;
  }

  const run = (async () => {
    try {
      // Listeners MUST be attached before register() so the FCM token is not missed.
      attachListeners();

      const permission = await requestPushPermission();

      if (permission !== 'granted') {
        pushLog.warn('Not registering — permission not granted');
        lastSaveError = `Permission is ${permission}`;
        lastSaveOk = false;
        return null;
      }

      // Permission already granted must still call register() — that is what
      // triggers UIApplication.registerForRemoteNotifications → APNs → FCM.
      await PushNotifications.register();

      const platform = getPushPlatform();
      // Wait briefly for the native registration callback; fall back to device-cached FCM.
      const token = (await waitForRegistrationToken(2500)) || currentToken || readCachedFcmToken();

      if (platform && token) {
        currentToken = token;
        await saveTokenToSupabase(token, platform);
      } else if (!token) {
        lastSaveOk = false;
        lastSaveError = 'No FCM token available after register()';
        pushLog.warn('No FCM token available after register()');
      }

      return currentToken;
    } catch (error) {
      lastSaveOk = false;
      lastSaveError = error instanceof Error ? error.message : String(error);
      pushLog.error('registerForPushNotifications failed', error);
      return null;
    } finally {
      // Only clear if we are still the active run (force can overlap).
      if (registrationInFlight === run) {
        registrationInFlight = null;
      }
    }
  })();

  registrationInFlight = run;
  return run;
}

/**
 * Deactivate this device's FCM association for the outgoing user (logout).
 * Uses register-push-token action=deactivate (service role) so cleanup is reliable.
 * Keeps the device-local FCM cache so the next login can reclaim the same token.
 */
export async function unregisterPushToken(): Promise<void> {
  if (!isNativePushAvailable()) return;

  try {
    const deviceId = getOrCreateDeviceId();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      currentToken = null;
      lastSaveOk = false;
      return;
    }

    const { data, error } = await supabase.functions.invoke('register-push-token', {
      body: {
        action: 'deactivate',
        device_id: deviceId,
        token: currentToken || readCachedFcmToken() || undefined,
      },
    });

    if (error) {
      const message = await extractFunctionsErrorMessage(error, data);
      pushLog.error('Unregister via Edge Function failed — trying own-row delete', message);

      // Own-row delete is allowed by RLS; cannot touch another user's row.
      const { error: deleteError } = await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', session.user.id)
        .eq('provider', 'fcm')
        .eq('device_id', deviceId);

      if (deleteError) {
        pushLog.error('Unregister delete failed', deleteError);
      }
    } else {
      pushLog.info('Token association deactivated on logout');
    }
  } catch (error) {
    pushLog.error('unregisterPushToken failed', error);
  } finally {
    currentToken = null;
    lastSaveOk = false;
    lastSaveError = null;
  }
}

/** Authenticated self-test only (Super Admin gated server-side). */
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
      const message = await extractFunctionsErrorMessage(error, data);
      pushLog.error('sendTestPush failed', message);
      return { success: false, error: message };
    }

    const payload = (data || {}) as Record<string, unknown>;
    if (payload.success === false) {
      const parts = [payload.message, payload.error, payload.hint]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      const detail =
        parts.join(' — ') ||
        (typeof payload.sent === 'number' && payload.sent === 0
          ? 'No active FCM tokens for this account'
          : 'Push send reported failure');
      pushLog.error('sendTestPush reported failure', payload);
      return { success: false, error: detail };
    }

    pushLog.info('sendTestPush ok', payload);
    return { success: true };
  } catch (error) {
    pushLog.error('sendTestPush exception', error);
    return { success: false, error: String(error) };
  }
}

export { handleNotificationAction };
