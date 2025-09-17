import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    const { action, orderId, trackingNumber } = await req.json();

    // Get user profile for eAWB configuration
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('eawb_api_key, eawb_name, eawb_email, eawb_phone, eawb_address')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile?.eawb_api_key) {
      throw new Error('eAWB configuration not found. Please configure eAWB in your settings.');
    }

    if (action === 'create_order') {
      // Get order details
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            product_title,
            quantity,
            product_price
          )
        `)
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      if (orderError || !order) {
        throw new Error('Order not found');
      }

      // Create eAWB order
      const eawbOrderData = {
        recipient: {
          name: order.customer_name,
          phone: order.customer_phone,
          email: order.customer_email,
          address: order.customer_address
        },
        sender: {
          name: profile.eawb_name,
          phone: profile.eawb_phone,
          email: profile.eawb_email,
          address: profile.eawb_address
        },
        parcel: {
          weight: 1, // Default weight - could be made configurable
          dimensions: {
            length: 30,
            width: 20,
            height: 10
          },
          declared_value: order.total,
          contents: order.order_items?.map((item: any) => 
            `${item.product_title} x${item.quantity}`
          ).join(', ') || 'Order contents',
          cash_on_delivery: order.payment_status === 'pending' ? order.total : 0
        },
        service: "standard", // Could be made configurable
        observations: `Order #${order.id.slice(-8)}`
      };

      console.log('Creating eAWB order with data:', JSON.stringify(eawbOrderData, null, 2));

      const eawbResponse = await fetch('https://api.europarcel.com/api/public/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${profile.eawb_api_key}`,
        },
        body: JSON.stringify(eawbOrderData),
      });

      const eawbResult = await eawbResponse.json();
      console.log('eAWB API response:', JSON.stringify(eawbResult, null, 2));

      if (!eawbResponse.ok) {
        throw new Error(`eAWB API error: ${JSON.stringify(eawbResult)}`);
      }

      // Update order with AWB number
      const awbNumber = eawbResult.awb || eawbResult.tracking_number || eawbResult.id;
      if (awbNumber) {
        const { error: updateError } = await supabase
          .from('orders')
          .update({ 
            shipping_status: 'processing',
            // Store AWB data in a custom field - you might want to add this column
            customer_phone: order.customer_phone ? `${order.customer_phone} | AWB: ${awbNumber}` : `AWB: ${awbNumber}`
          })
          .eq('id', orderId)
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Error updating order:', updateError);
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        awb_number: awbNumber,
        eawb_response: eawbResult 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'track_order') {
      if (!trackingNumber) {
        throw new Error('Tracking number is required');
      }

      const trackingResponse = await fetch(`https://api.europarcel.com/api/public/track/${trackingNumber}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${profile.eawb_api_key}`,
        },
      });

      const trackingResult = await trackingResponse.json();

      if (!trackingResponse.ok) {
        throw new Error(`Tracking API error: ${JSON.stringify(trackingResult)}`);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        tracking_data: trackingResult 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      throw new Error('Invalid action. Use "create_order" or "track_order"');
    }

  } catch (error) {
    console.error('Error in eawb-delivery function:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});