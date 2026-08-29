import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  ensurePushListenersAttached,
  isNativePushAvailable,
  registerForPushNotifications,
  unregisterPushToken,
} from '@/lib/notifications/pushNotifications';
import { requestOpenOrder, requestOpenReviews } from '@/lib/notifications/navigation';
import type { NotificationDataPayload } from '@/lib/notifications/types';
import { pushLog } from '@/lib/notifications/logger';

type ForegroundDetail = {
  title?: string;
  body?: string;
  data?: NotificationDataPayload;
};

/**
 * Non-blocking FCM push initializer for native Capacitor builds.
 * Runs for EVERY authenticated user — never Super Admin gated.
 * Listeners attach immediately (cold-start taps). Token registration waits for login.
 */
export function useFcmPushNotifications() {
  const { user, loading } = useAuth();
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativePushAvailable()) return;
    ensurePushListenersAttached();

    const onForeground = (event: Event) => {
      const detail = (event as CustomEvent<ForegroundDetail>).detail || {};
      const data = detail.data || {};
      const title = detail.title || 'SpeedVendors';
      const description = detail.body;
      const orderId = data.order_id || (data.type === 'order' ? data.id : undefined);

      toast(title, {
        description,
        duration: 6000,
        action:
          data.type === 'order' && orderId
            ? {
                label: 'View',
                onClick: () => requestOpenOrder(orderId),
              }
            : data.type === 'review'
              ? {
                  label: 'View',
                  onClick: () => requestOpenReviews(),
                }
              : undefined,
      });
    };

    window.addEventListener('sv:push-foreground', onForeground);
    return () => window.removeEventListener('sv:push-foreground', onForeground);
  }, []);

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

    let cancelled = false;

    const runRegister = () => {
      if (cancelled) return;
      lastUserId.current = userId;
      // force: true — always call PushNotifications.register() for this session.
      // Must not depend on Super Admin UI / manual Re-register.
      void registerForPushNotifications({ force: true })
        .then(() => pushLog.info('Init complete for user session'))
        .catch((error) => pushLog.error('Init failed (non-blocking)', error));
    };

    // Defer slightly so dashboard/auth UI is not competing with the OS prompt.
    const timer = window.setTimeout(runRegister, 1500);

    // Re-register when returning to foreground (covers account switch / missed APNs).
    const listenerPromise = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive || cancelled) return;
      void registerForPushNotifications({ force: true }).catch(() => {
        /* non-blocking */
      });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      void listenerPromise.then((handle) => handle.remove());
    };
  }, [user?.id, loading]);
}
