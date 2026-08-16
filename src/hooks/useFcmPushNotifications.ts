import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  isNativePushAvailable,
  registerForPushNotifications,
  unregisterPushToken,
} from '@/lib/notifications/pushNotifications';
import { pushLog } from '@/lib/notifications/logger';

/**
 * Non-blocking FCM push initializer for native Capacitor builds.
 * Does not run OneSignal. Web is a no-op (no web push in this task).
 * Legacy OneSignal hook remains in the codebase unused by App.tsx.
 */
export function useFcmPushNotifications() {
  const { user, loading } = useAuth();
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!isNativePushAvailable()) return;

    const userId = user?.id ?? null;

    if (!userId) {
      if (lastUserId.current) {
        void unregisterPushToken().catch(() => {
          /* non-blocking */
        });
        lastUserId.current = null;
      }
      return;
    }

    if (lastUserId.current === userId) return;
    lastUserId.current = userId;

    // Defer slightly so dashboard/auth UI is not competing with the OS prompt.
    const timer = window.setTimeout(() => {
      void registerForPushNotifications()
        .then(() => pushLog.info('Init complete for user session'))
        .catch((error) => pushLog.error('Init failed (non-blocking)', error));
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [user?.id, loading]);
}
