import { useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

// OneSignal Web SDK types
declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: OneSignalInstance) => void>;
    OneSignal?: OneSignalInstance;
  }
}

interface OneSignalInstance {
  init: (config: { appId: string; allowLocalhostAsSecureOrigin?: boolean }) => Promise<void>;
  User: {
    PushSubscription: {
      id: string | null;
      token: string | null;
    };
  };
  Notifications: {
    permission: boolean;
    requestPermission: () => Promise<void>;
    addEventListener: (event: string, callback: (data: { notification: { title: string; body: string } }) => void) => void;
  };
}

export const usePushNotifications = () => {
  const registerDeviceToken = useCallback(async (playerId: string, token: string, platform: 'ios' | 'android' | 'web') => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No session, skipping push token registration');
        return;
      }

      const response = await supabase.functions.invoke('push-notification', {
        body: {
          action: 'register_token',
          device_token: token,
          platform,
          onesignal_player_id: playerId,
        },
      });

      if (response.error) {
        console.error('Error registering push token:', response.error);
      } else {
        console.log('Push token registered successfully');
      }
    } catch (error) {
      console.error('Failed to register push token:', error);
    }
  }, []);

  const initializeOneSignal = useCallback(async () => {
    const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;
    
    if (!ONESIGNAL_APP_ID) {
      console.log('OneSignal App ID not configured for client');
      return;
    }

    if (Capacitor.isNativePlatform()) {
      // Native iOS/Android initialization would go here
      // For now, we'll handle this through the native OneSignal SDK
      console.log('Native push notifications - configure in native project');
      return;
    }

    // Web push notifications
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
      });

      // Request permission
      await OneSignal.Notifications.requestPermission();

      // Get player ID and token
      const playerId = OneSignal.User.PushSubscription.id;
      const token = OneSignal.User.PushSubscription.token;

      if (playerId && token) {
        await registerDeviceToken(playerId, token, 'web');
      }

      // Listen for notifications
      OneSignal.Notifications.addEventListener('click', (event) => {
        console.log('Notification clicked:', event.notification);
      });
    });

    // Load OneSignal SDK
    const script = document.createElement('script');
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.defer = true;
    document.head.appendChild(script);
  }, [registerDeviceToken]);

  useEffect(() => {
    // Initialize when user is logged in
    const checkAuthAndInit = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        initializeOneSignal();
      }
    };

    checkAuthAndInit();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        initializeOneSignal();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [initializeOneSignal]);

  return {
    initializeOneSignal,
    registerDeviceToken,
  };
};

// Utility function to send notifications from the app
export const sendPushNotification = async (params: {
  userIds?: string[];
  title: string;
  message: string;
  notificationType: 'order_update' | 'marketing' | 'admin_alert';
  data?: Record<string, string>;
}) => {
  try {
    const response = await supabase.functions.invoke('push-notification', {
      body: {
        action: 'send',
        user_ids: params.userIds,
        title: params.title,
        message: params.message,
        notification_type: params.notificationType,
        data: params.data,
      },
    });

    if (response.error) {
      console.error('Error sending notification:', response.error);
      return { success: false, error: response.error };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Failed to send notification:', error);
    return { success: false, error };
  }
};
