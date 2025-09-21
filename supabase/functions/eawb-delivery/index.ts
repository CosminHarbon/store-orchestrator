import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== eAWB Delivery Service ===');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { action, order_id, package_details, selected_carrier, selected_service, address_override } = await req.json();
    console.log('Request:', { action, order_id, selected_carrier, selected_service });

    // Get authenticated user
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Unauthorized' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      });
    }

    if (action === 'calculate_prices') {
      // Delegate to eawb-quoting function
      const quotingResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/eawb-quoting`, {
        method: 'POST',
        headers: {
          'Authorization': req.headers.get('Authorization')!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ order_id, package_details, address_override })
      });

      const quotingData = await quotingResponse.json();
      
      if (quotingData.success && quotingData.carrier_options) {
        // Transform to legacy format for AWBCreationModal compatibility
        const quotes = quotingData.carrier_options.map((option: any) => ({
          carrier_id: option.carrier_id,
          carrier_name: option.carrier_info?.name || 'Unknown Carrier',
          carrier_logo: option.carrier_info?.logo_url,
          service_id: option.service_id,
          service_name: option.service_info?.name || 'Unknown Service',
          service_description: option.service_info?.description || '',
          price: option.price?.total || 0,
          currency: option.price?.currency || 'RON',
          estimated_pickup_date: option.estimated_pickup_date,
          estimated_delivery_date: option.estimated_delivery_date
        }));

        return new Response(JSON.stringify({
          success: true,
          quotes,
          debug_info: quotingData.debug_info
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: quotingData.error || 'NO_QUOTES',
          message: quotingData.message || 'No shipping quotes available'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (action === 'create_order') {
      // Get user profile and order
      const [profileResult, orderResult] = await Promise.all([
        supabaseClient.from('profiles').select('*').eq('user_id', user.id).single(),
        supabaseClient.from('orders').select('*').eq('id', order_id).eq('user_id', user.id).single()
      ]);

      if (profileResult.error || !profileResult.data) {
        throw new Error('Profile not found');
      }
      if (orderResult.error || !orderResult.data) {
        throw new Error('Order not found');
      }

      const profile = profileResult.data;
      const order = orderResult.data;

      if (!profile.eawb_api_key) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_API_KEY',
          message: 'eAWB API key not configured'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Runtime base URL detection
      const detectBaseUrl = async (apiKey: string): Promise<string> => {
        const candidates = [
          'https://api.europarcel.com/api/public',
          'https://api.europarcel.com/api/v1',
          'https://api.europarcel.com'
        ];

        for (const baseUrl of candidates) {
          try {
            const response = await fetch(`${baseUrl}/carriers`, {
              method: 'GET',
              headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              console.log(`✓ Base URL working: ${baseUrl}`);
              return baseUrl;
            }
          } catch (error) {
            console.log(`✗ Base URL failed: ${baseUrl}`);
          }
        }
        
        return candidates[0]; // fallback
      };

      const BASE_URL = await detectBaseUrl(profile.eawb_api_key);
      console.log('Using base URL:', BASE_URL);

      // Enhanced address parsing
      const parseAddress = (address: string) => {
        const cleaned = address
          .replace(/,?\s*(ap\.?\s*\d+|apartament\s*\d+|etaj\s*\d+|et\.?\s*\d+)/gi, '')
          .replace(/,?\s*(bl\.?\s*[A-Z0-9]+|bloc\s+[A-Z0-9]+)/gi, '')
          .trim();

        const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);
        
        // Handle Bucharest specifically
        if (/bucure[sș]ti|sector\s*[1-6]/gi.test(address)) {
          return {
            city: 'București',
            county: 'București',
            street: parts[0] || '',
            postal_code: address.match(/\b\d{6}\b/)?.[0] || ''
          };
        }

        // Standard parsing
        let city = 'București'; // fallback
        let county = 'București';
        let street = parts[0] || '';

        if (parts.length >= 3) {
          street = parts[0];
          city = parts[1];
          county = parts[2].replace(/^(jud\.?\s*|judetul\s*)/i, '');
        } else if (parts.length === 2) {
          street = parts[0];
          city = parts[1];
          county = parts[1];
        }

        return {
          city: city.charAt(0).toUpperCase() + city.slice(1),
          county: county.charAt(0).toUpperCase() + county.slice(1),
          street,
          postal_code: address.match(/\b\d{6}\b/)?.[0] || ''
        };
      };

      const extractStreetInfo = (address: string) => {
        const parts = address.split(/[,\s]+/);
        let streetName = parts[0] || 'Strada';
        let streetNumber = '';

        for (const part of parts) {
          if (/\d+/.test(part)) {
            streetNumber = part.replace(/[^\d]/g, '');
            break;
          }
        }

        return {
          street_name: streetName || 'Strada',
          street_number: streetNumber || '1'
        };
      };

      // Parse addresses
      const senderParsed = parseAddress(profile.eawb_address || 'București, România');
      const recipientParsed = address_override ? {
        city: address_override.city || parseAddress(order.customer_address).city,
        county: address_override.county || parseAddress(order.customer_address).county,
        street: parseAddress(order.customer_address).street,
        postal_code: address_override.postal_code || parseAddress(order.customer_address).postal_code
      } : parseAddress(order.customer_address);

      console.log('Addresses:', { sender: senderParsed, recipient: recipientParsed });

      const senderStreet = extractStreetInfo(profile.eawb_address || '');
      const recipientStreet = extractStreetInfo(order.customer_address);

      // Build AWB request
      const awbRequest = {
        billing_to: { 
          billing_address_id: profile.eawb_billing_address_id || 1 
        },
        address_from: {
          country_code: 'RO',
          county_name: senderParsed.county,
          locality_name: senderParsed.city,
          postal_code: senderParsed.postal_code || undefined,
          contact: profile.eawb_name || profile.store_name || 'Sender',
          street_name: senderStreet.street_name,
          street_number: senderStreet.street_number,
          phone: profile.eawb_phone || '0700000000',
          email: profile.eawb_email || user.email
        },
        address_to: {
          country_code: 'RO',
          county_name: recipientParsed.county,
          locality_name: recipientParsed.city,
          postal_code: recipientParsed.postal_code || undefined,
          contact: order.customer_name,
          street_name: recipientStreet.street_name,
          street_number: recipientStreet.street_number,
          phone: order.customer_phone || '0700000000',
          email: order.customer_email
        },
        parcels: [{
          weight: package_details.weight || 1,
          length: package_details.length || 30,
          width: package_details.width || 20,
          height: package_details.height || 10,
          contents: package_details.contents || 'Goods',
          declared_value: package_details.declared_value || order.total,
          ...(package_details.cod_amount && { cod_amount: package_details.cod_amount })
        }],
        service: {
          currency: 'RON',
          payment_type: 1,
          send_invoice: false,
          allow_bank_to_open: false,
          fragile: false,
          pickup_available: false,
          allow_saturday_delivery: false,
          sunday_delivery: false,
          morning_delivery: false
        },
        carrier_id: Number(selected_carrier),
        service_id: Number(selected_service)
      };

      console.log('Creating AWB with request:', JSON.stringify(awbRequest, null, 2));

      // Create AWB
      const response = await fetch(`${BASE_URL}/create-order`, {
        method: 'POST',
        headers: {
          'X-API-Key': profile.eawb_api_key,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(awbRequest)
      });

      const responseData = await response.json();
      console.log('AWB creation response:', responseData);

      if (response.ok && responseData.success) {
        const awbData = responseData.data;
        
        // Update order with AWB details
        const updateData: any = {
          awb_number: awbData.awb_number || awbData.awb_id,
          shipping_status: 'shipped',
          eawb_order_id: awbData.id || awbData.order_id
        };

        if (awbData.tracking_url || awbData.tracking_link) {
          updateData.tracking_url = awbData.tracking_url || awbData.tracking_link;
        }

        if (awbData.carrier_name) {
          updateData.carrier_name = awbData.carrier_name;
        }

        if (awbData.estimated_delivery_date) {
          updateData.estimated_delivery_date = awbData.estimated_delivery_date;
        }

        const { error: updateError } = await supabaseClient
          .from('orders')
          .update(updateData)
          .eq('id', order_id)
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Order update error:', updateError);
          // Don't fail the entire request for update errors
        }

        return new Response(JSON.stringify({
          success: true,
          awb_number: awbData.awb_number || awbData.awb_id,
          tracking_url: awbData.tracking_url || awbData.tracking_link,
          estimated_delivery_date: awbData.estimated_delivery_date,
          carrier_name: awbData.carrier_name,
          message: 'AWB created successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        console.error('AWB creation failed:', responseData);
        return new Response(JSON.stringify({
          success: false,
          error: 'AWB_CREATION_FAILED',
          message: responseData.message || 'Failed to create AWB',
          details: responseData
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'INVALID_ACTION',
      message: 'Invalid action specified'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Delivery service error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message || 'Internal server error',
      details: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});