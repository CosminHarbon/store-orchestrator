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

    const { action, orderId, packageDetails, selectedCarrier, trackingNumber } = await req.json();

    // Get user profile for eAWB configuration
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('eawb_api_key, eawb_name, eawb_email, eawb_phone, eawb_address')
      .eq('user_id', user.id)
      .maybeSingle();

    console.log('Profile data:', JSON.stringify(profile, null, 2));

    if (profileError) {
      console.error('Profile error:', profileError);
      throw new Error(`Profile error: ${profileError.message}`);
    }

    if (!profile || !profile.eawb_api_key) {
      throw new Error('eAWB configuration not found. Please configure eAWB in your settings.');
    }

    if (action === 'calculate_prices') {
      // Get order details
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      if (orderError || !order) {
        throw new Error('Order not found');
      }

      // Parse addresses properly
      const senderAddress = {
        country_code: "RO",
        county: profile.eawb_address?.includes(',') 
          ? profile.eawb_address.split(',')[1]?.trim() || "Prahova"
          : "Prahova", 
        locality: profile.eawb_address?.split(',')[0]?.trim() || "Ploiesti",
        address: profile.eawb_address || "Ploiesti, Prahova"
      };

      const recipientAddress = {
        country_code: "RO",
        county: order.customer_address.includes(',') 
          ? order.customer_address.split(',').slice(-2)[0]?.trim() || "Bucuresti"
          : "Bucuresti",
        locality: order.customer_address.includes(',') 
          ? order.customer_address.split(',').slice(-1)[0]?.trim() || "Bucuresti"
          : order.customer_address.split(' ')[0] || "Bucuresti",
        address: order.customer_address
      };

      // Calculate shipping prices with eAWB API
      const priceRequest = {
        from: senderAddress,
        to: recipientAddress,
        parcels: [{
          weight: packageDetails.weight,
          length: packageDetails.length,
          width: packageDetails.width,
          height: packageDetails.height,
          declared_value: packageDetails.declared_value
        }],
        cod_amount: packageDetails.cod_amount,
        options: {
          saturday_delivery: false,
          sunday_delivery: false,
          morning_delivery: false
        }
      };

      console.log('Calculating prices with request:', JSON.stringify(priceRequest, null, 2));

      const priceResponse = await fetch('https://api.europarcel.com/api/public/orders/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': profile.eawb_api_key,
        },
        body: JSON.stringify(priceRequest),
      });

      const priceResult = await priceResponse.json();
      console.log('eAWB Price API response:', JSON.stringify(priceResult, null, 2));

      if (!priceResponse.ok) {
        throw new Error(`eAWB Price API error: ${JSON.stringify(priceResult)}`);
      }

      // Transform the response to a consistent format
      const carrierOptions = priceResult.prices?.map((price: any) => ({
        carrier_id: price.carrier_id,
        carrier_name: price.carrier_name,
        service_id: price.service_id,
        service_name: price.service_name,
        price: price.total_price,
        currency: price.currency,
        delivery_time: price.delivery_time || 'Standard',
        cod_available: price.cod_available || false
      })) || [];

      return new Response(JSON.stringify({ 
        success: true, 
        carrier_options: carrierOptions
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'create_order') {
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

      // Create eAWB order using the selected carrier
      const eawbOrderData = {
        from: {
          name: profile.eawb_name || "Your Company",
          phone: profile.eawb_phone || "",
          email: profile.eawb_email || "",
          country_code: "RO",
          county: profile.eawb_address?.includes(',') 
            ? profile.eawb_address.split(',')[1]?.trim() || "Prahova"
            : "Prahova",
          locality: profile.eawb_address?.split(',')[0]?.trim() || "Ploiesti", 
          address: profile.eawb_address || "Ploiesti, Prahova"
        },
        to: {
          name: order.customer_name,
          phone: order.customer_phone || "",
          email: order.customer_email,
          country_code: "RO",
          county: order.customer_address.includes(',') 
            ? order.customer_address.split(',').slice(-2)[0]?.trim() || "Bucuresti"
            : "Bucuresti",
          locality: order.customer_address.includes(',') 
            ? order.customer_address.split(',').slice(-1)[0]?.trim() || "Bucuresti"
            : order.customer_address.split(' ')[0] || "Bucuresti",
          address: order.customer_address
        },
        parcels: [{
          weight: packageDetails.weight,
          length: packageDetails.length,
          width: packageDetails.width,
          height: packageDetails.height,
          declared_value: packageDetails.declared_value,
          contents: packageDetails.contents
        }],
        service: {
          carrier_id: selectedCarrier.carrier_id,
          service_id: selectedCarrier.service_id
        },
        cod_amount: packageDetails.cod_amount,
        observations: `Order #${order.id.slice(-8)} - ${packageDetails.contents}`,
        reference: order.id,
        pickup_date: new Date().toISOString().split('T')[0], // Today's date
        delivery_date: new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0] // Tomorrow
      };

      console.log('Creating eAWB order with data:', JSON.stringify(eawbOrderData, null, 2));

      const eawbResponse = await fetch('https://api.europarcel.com/api/public/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': profile.eawb_api_key,
        },
        body: JSON.stringify(eawbOrderData),
      });

      const eawbResult = await eawbResponse.json();
      console.log('eAWB Create Order API response:', JSON.stringify(eawbResult, null, 2));

      if (!eawbResponse.ok) {
        throw new Error(`eAWB Create Order API error: ${JSON.stringify(eawbResult)}`);
      }

      // Update order with AWB number and shipping info
      const awbNumber = eawbResult.awb || eawbResult.tracking_number || eawbResult.order_id;
      if (awbNumber) {
        const { error: updateError } = await supabase
          .from('orders')
          .update({ 
            shipping_status: 'processing',
            // You might want to add an awb_number column to the orders table
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
        carrier_name: selectedCarrier.carrier_name,
        service_name: selectedCarrier.service_name,
        tracking_url: eawbResult.tracking_url,
        eawb_response: eawbResult 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'track_order') {
      if (!trackingNumber) {
        throw new Error('Tracking number is required');
      }

      const trackingResponse = await fetch(`https://api.europarcel.com/api/public/orders/track-by-awb`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': profile.eawb_api_key,
        },
        body: JSON.stringify({
          awbs: [{ awb: trackingNumber }]
        }),
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
      throw new Error('Invalid action. Use "calculate_prices", "create_order" or "track_order"');
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