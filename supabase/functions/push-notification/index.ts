import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushNotificationRequest {
  action: 'send' | 'register_token';
  // For sending notifications
  user_ids?: string[];
  title?: string;
  message?: string;
  data?: Record<string, string>;
  notification_type?: 'order_update' | 'marketing' | 'admin_alert';
  // For registering tokens
  device_token?: string;
  platform?: 'ios' | 'android' | 'web';
  onesignal_player_id?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
    const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.error('OneSignal credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Push notification service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: PushNotificationRequest = await req.json();

    console.log('Push notification request:', JSON.stringify(body));

    if (body.action === 'register_token') {
      // Get user from authorization header
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Authorization required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        console.error('Auth error:', authError);
        return new Response(
          JSON.stringify({ error: 'Invalid authorization' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Register device token
      const { error: insertError } = await supabase
        .from('push_tokens')
        .upsert({
          user_id: user.id,
          device_token: body.device_token,
          platform: body.platform || 'ios',
          onesignal_player_id: body.onesignal_player_id,
        }, {
          onConflict: 'user_id,device_token'
        });

      if (insertError) {
        console.error('Error saving push token:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to register device' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Device token registered for user:', user.id);
      return new Response(
        JSON.stringify({ success: true, message: 'Device registered' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.action === 'send') {
      const { user_ids, title, message, data, notification_type } = body;

      if (!title || !message) {
        return new Response(
          JSON.stringify({ error: 'Title and message are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get OneSignal player IDs for the target users
      let playerIds: string[] = [];

      if (user_ids && user_ids.length > 0) {
        const { data: tokens, error: tokensError } = await supabase
          .from('push_tokens')
          .select('onesignal_player_id')
          .in('user_id', user_ids)
          .not('onesignal_player_id', 'is', null);

        if (tokensError) {
          console.error('Error fetching tokens:', tokensError);
        } else if (tokens) {
          playerIds = tokens
            .map(t => t.onesignal_player_id)
            .filter(Boolean) as string[];
        }
      }

      console.log(`Sending notification to ${playerIds.length} devices`);

      // If no specific users, send to all (for marketing)
      const notificationPayload: Record<string, unknown> = {
        app_id: ONESIGNAL_APP_ID,
        headings: { en: title },
        contents: { en: message },
        data: {
          ...data,
          notification_type: notification_type || 'general',
        },
      };

      if (playerIds.length > 0) {
        notificationPayload.include_player_ids = playerIds;
      } else if (notification_type === 'marketing') {
        // Send to all subscribed users for marketing
        notificationPayload.included_segments = ['Subscribed Users'];
      } else {
        // If no target users found, return early
        return new Response(
          JSON.stringify({ success: false, message: 'No target devices found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Send to OneSignal
      const oneSignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
        },
        body: JSON.stringify(notificationPayload),
      });

      const oneSignalResult = await oneSignalResponse.json();
      console.log('OneSignal response:', JSON.stringify(oneSignalResult));

      if (!oneSignalResponse.ok) {
        return new Response(
          JSON.stringify({ error: 'Failed to send notification', details: oneSignalResult }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Notification sent',
          recipients: playerIds.length || 'all subscribed users',
          onesignal_id: oneSignalResult.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Push notification error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
