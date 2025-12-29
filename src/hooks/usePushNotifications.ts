import { useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

// OneSignal Web SDK types
declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: OneSignalInstance) => void>;
    OneSignal?: OneSignalInstance;
    plugins?: {
      OneSignal?: NativeOneSignalPlugin;
    };
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

// Native OneSignal plugin interface (Cordova/Capacitor)
interface NativeOneSignalPlugin {
  setAppId: (appId: string) => void;
  promptForPushNotificationsWithUserResponse: (callback: (accepted: boolean) => void) => void;
  getDeviceState: (callback: (state: { userId?: string; pushToken?: string; isSubscribed?: boolean }) => void) => void;
  setNotificationOpenedHandler: (callback: (data: unknown) => void) => void;
  setNotificationWillShowInForegroundHandler: (callback: (data: { notification: unknown; complete: (notification: unknown) => void }) => void) => void;
}

export const usePushNotifications = () => {
  const registerDeviceToken = useCallback(async (playerId: string, token: string, platform: 'ios' | 'android' | 'web') => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No session, skipping push token registration');
        return;
      }

      console.log(`Registering push token: platform=${platform}, playerId=${playerId}`);

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
        console.log('Push token registered successfully:', response.data);
      }
    } catch (error) {
      console.error('Failed to register push token:', error);
    }
  }, []);

  const initializeNativeOneSignal = useCallback(async () => {
    const ONESIGNAL_APP_ID = '174b3f62-9e31-4e4d-a38a-f4f0c310fe80'; // You should replace this with your actual OneSignal App ID
    
    console.log('Initializing native OneSignal...');
    
    // Wait for the plugin to be available
    const waitForPlugin = (): Promise<NativeOneSignalPlugin | null> => {
      return new Promise((resolve) => {
        let attempts = 0;
        const checkPlugin = () => {
          attempts++;
          if (window.plugins?.OneSignal) {
            resolve(window.plugins.OneSignal);
          } else if (attempts < 20) {
            setTimeout(checkPlugin, 500);
          } else {
            console.log('OneSignal native plugin not found after 10 seconds');
            resolve(null);
          }
        };
        checkPlugin();
      });
    };

    const OneSignal = await waitForPlugin();
    
    if (!OneSignal) {
      console.log('OneSignal native plugin not available');
      return;
    }

    try {
      // Initialize OneSignal with app ID
      OneSignal.setAppId(ONESIGNAL_APP_ID);
      console.log('OneSignal app ID set');

      // Request push notification permissions
      OneSignal.promptForPushNotificationsWithUserResponse((accepted) => {
        console.log('Push notifications permission:', accepted ? 'granted' : 'denied');
      });

      // Get device state and register token
      const getAndRegisterToken = () => {
        OneSignal.getDeviceState((state) => {
          console.log('OneSignal device state:', JSON.stringify(state));
          
          if (state?.userId) {
            const platform = Capacitor.getPlatform() as 'ios' | 'android';
            registerDeviceToken(state.userId, state.pushToken || state.userId, platform);
          } else {
            console.log('No OneSignal userId yet, will retry...');
            // Retry after a delay
            setTimeout(getAndRegisterToken, 3000);
          }
        });
      };

      // Initial attempt
      setTimeout(getAndRegisterToken, 2000);

      // Handle notifications when app is opened
      OneSignal.setNotificationOpenedHandler((data) => {
        console.log('Notification opened:', data);
      });

      // Handle notifications when app is in foreground
      OneSignal.setNotificationWillShowInForegroundHandler((event) => {
        console.log('Notification received in foreground:', event.notification);
        // Show the notification
        event.complete(event.notification);
      });

    } catch (error) {
      console.error('Error initializing native OneSignal:', error);
    }
  }, [registerDeviceToken]);

  const initializeWebOneSignal = useCallback(async () => {
    const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;
    
    if (!ONESIGNAL_APP_ID) {
      console.log('OneSignal App ID not configured for client');
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

  const initializeOneSignal = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      await initializeNativeOneSignal();
    } else {
      await initializeWebOneSignal();
    }
  }, [initializeNativeOneSignal, initializeWebOneSignal]);

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
