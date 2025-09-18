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

async function resolveLocality(apiKey: string, countryCode: string, addressText: string) {
  try {
    if (!addressText || addressText.trim() === '') {
      console.error('Empty address text provided');
      return null;
    }

    // Extract city name from address - try different patterns
    let cityName = '';
    const address = addressText.trim();
    
    // Pattern 1: "City, County" or "City County"  
    // Pattern 2: "Street..., City, County"
    // Pattern 3: "Street..., City"
    const parts = address.split(/[,\s]+/);
    
    // Look for Romanian city names (common patterns)
    const romanianCities = ['bucuresti', 'bucharest', 'cluj', 'timisoara', 'iasi', 'constanta', 'craiova', 'brasov', 'galati', 'ploiesti', 'oradea', 'braila', 'arad', 'pitesti', 'sibiu', 'bacau', 'targu-mures', 'baia-mare', 'buzau', 'botosani', 'satu-mare', 'ramnicu-valcea', 'drobeta-turnu-severin', 'piatra-neamt', 'targoviste', 'focsani', 'tulcea', 'resita', 'alba-iulia', 'bistrita'];
    
    // Try to find a Romanian city in the address parts
    for (const part of parts) {
      const cleanPart = part.toLowerCase().replace(/[^\w-]/g, '');
      if (romanianCities.some(city => cleanPart.includes(city) || city.includes(cleanPart))) {
        cityName = part;
        break;
      }
    }
    
    // If no match found, take the last meaningful part (likely city)
    if (!cityName) {
      // Skip common words and take the last significant part
      const skipWords = ['str', 'strada', 'nr', 'ap', 'bl', 'et', 'sc', 'romania'];
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i].toLowerCase();
        if (part.length > 2 && !skipWords.includes(part) && isNaN(Number(part))) {
          cityName = parts[i];
          break;
        }
      }
    }
    
    // Fallback to first part if nothing found
    if (!cityName) {
      cityName = parts[0] || address;
    }

    console.log(`Attempting to resolve locality for address: "${addressText}" -> extracted city: "${cityName}"`);
    
    const query = encodeURIComponent(cityName.trim());
    const url = `https://api.europarcel.com/api/public/search/localities/${countryCode}?search=${query}`;
    const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
    const data = await res.json();
    console.log('Locality search result for', cityName, ':', JSON.stringify(data, null, 2));
    
    const item = data?.data?.[0] || data?.[0];
    if (!res.ok || !item) {
      console.error(`Failed to resolve locality for "${cityName}" from address "${addressText}"`);
      return null;
    }
    
    return {
      locality_id: item.id || item.locality_id,
      locality_name: item.locality_name || item.name,
      county_name: item.county_name || item.county,
      country_code: countryCode,
    };
  } catch (e) {
    console.error('resolveLocality error for address:', addressText, 'Error:', e);
    return null;
  }
}

function extractStreetInfo(address: string) {
  const parts = address.split(/[,\s]+/);
  let streetName = '';
  let streetNumber = '';
  
  // Look for street patterns
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].toLowerCase();
    if (part.includes('str') || part.includes('strada') || part.includes('bd') || part.includes('bulevardul')) {
      streetName = parts.slice(i, i + 2).join(' ');
      // Look for number in next parts
      for (let j = i + 1; j < parts.length; j++) {
        if (/\d+/.test(parts[j])) {
          streetNumber = parts[j].replace(/[^\d]/g, '');
          break;
        }
      }
      break;
    }
  }
  
  // Fallback: take first part as street, look for numbers
  if (!streetName) {
    streetName = parts[0] || 'Adresa';
    for (const part of parts) {
      if (/\d+/.test(part)) {
        streetNumber = part.replace(/[^\d]/g, '');
        break;
      }
    }
  }
  
  return {
    street_name: streetName || 'Strada',
    street_number: streetNumber || '1'
  };
}

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

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid JSON in request body' 
      }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { action, orderId, packageDetails, selectedCarrier, trackingNumber, carrier_id } = requestBody;

    // Create a Supabase client with the user's auth for RLS-aware queries
    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user profile for eAWB configuration
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('eawb_api_key, eawb_name, eawb_email, eawb_phone, eawb_address, eawb_billing_address_id, eawb_default_carrier_id, eawb_default_service_id')
      .eq('user_id', user.id)
      .maybeSingle();

    console.log('Profile data:', JSON.stringify(profile, null, 2));

    if (profileError) {
      console.error('Profile error:', profileError);
      throw new Error(`Profile error: ${profileError.message}`);
    }

    if (!profile || !profile.eawb_api_key) {
      return new Response(JSON.stringify({ success: false, error: 'eAWB configuration not found. Please configure eAWB in your settings.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'fetch_billing_addresses') {
      // Note: eAWB API may not have a public endpoint for billing addresses
      // For now, return an informational message as a 200 response so the UI can show it nicely
      return new Response(JSON.stringify({
        success: false,
        error: 'Billing addresses endpoint not available',
        message: 'Please manually enter your billing address ID from your eAWB dashboard (usually 1 for the primary address)',
        suggestion: 'Log into your EuroParcel account and check Settings > Billing Addresses for the correct ID'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'fetch_carriers') {
      // Note: eAWB API may not have a public endpoint for carriers list
      // Return an informational message with 200 so the UI can display it
      return new Response(JSON.stringify({
        success: false,
        error: 'Carriers endpoint not available',
        message: 'Please manually enter carrier and service IDs from your eAWB dashboard',
        suggestion: 'Log into your EuroParcel account to find available carrier and service IDs'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'fetch_services') {
      // Note: eAWB API may not have a public endpoint for services list
      return new Response(JSON.stringify({
        success: false,
        error: 'Services endpoint not available',
        message: 'Please manually enter service ID from your eAWB dashboard',
        suggestion: 'Log into your EuroParcel account to find available service IDs for your selected carrier'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'calculate_prices') {
      // Get order details
      const { data: order, error: orderError } = await sb
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      if (orderError || !order) {
        return new Response(JSON.stringify({ success: false, error: 'Order not found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Resolve localities from free-text addresses
      const senderLoc = await resolveLocality(profile.eawb_api_key, 'RO', profile.eawb_address || '');
      const recipientLoc = await resolveLocality(profile.eawb_api_key, 'RO', order.customer_address || '');

      if (!senderLoc || !recipientLoc) {
        return new Response(
          JSON.stringify({ success: false, error: 'ADDRESS_VALIDATION_FAILED', details: { senderLoc, recipientLoc } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Extract street details from addresses
      const extractStreetInfo = (address: string) => {
        const parts = address.split(/[,\s]+/);
        let streetName = '';
        let streetNumber = '';
        
        // Look for street patterns
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i].toLowerCase();
          if (part.includes('str') || part.includes('strada') || part.includes('bd') || part.includes('bulevardul')) {
            streetName = parts.slice(i, i + 2).join(' ');
            // Look for number in next parts
            for (let j = i + 1; j < parts.length; j++) {
              if (/\d+/.test(parts[j])) {
                streetNumber = parts[j].replace(/[^\d]/g, '');
                break;
              }
            }
            break;
          }
        }
        
        // Fallback: take first part as street, look for numbers
        if (!streetName) {
          streetName = parts[0] || 'Adresa';
          for (const part of parts) {
            if (/\d+/.test(part)) {
              streetNumber = part.replace(/[^\d]/g, '');
              break;
            }
          }
        }
        
        return {
          street_name: streetName || 'Strada',
          street_number: streetNumber || '1'
        };
      };

      const senderStreet = extractStreetInfo(profile.eawb_address || '');
      const recipientStreet = extractStreetInfo(order.customer_address || '');

      // Calculate shipping prices with proper eAWB API structure
      // Ensure required IDs exist: billing address, carrier, service
      let billingAddressId: number | null = (profile.eawb_billing_address_id && profile.eawb_billing_address_id > 0)
        ? profile.eawb_billing_address_id
        : null;

      let carrierId: number | null = (profile.eawb_default_carrier_id && profile.eawb_default_carrier_id > 0)
        ? profile.eawb_default_carrier_id
        : null;

      let serviceId: number | null = (profile.eawb_default_service_id && profile.eawb_default_service_id > 0)
        ? profile.eawb_default_service_id
        : null;

      // Try to auto-resolve missing IDs from eAWB API
      try {
        if (!billingAddressId) {
          // Try a common billing endpoint pattern - if it fails, fallback to 1
          try {
            const baRes = await fetch('https://api.europarcel.com/api/public/billing-addresses', {
              method: 'GET',
              headers: {
                'X-API-Key': profile.eawb_api_key,
                'Content-Type': 'application/json',
              },
            });
            if (baRes.ok) {
              const baData = await baRes.json();
              const first = baData?.data?.[0] || baData?.[0];
              billingAddressId = (first?.id ?? first?.billing_address_id) || 1;
            } else {
              billingAddressId = 1; // conservative fallback
            }
          } catch {
            billingAddressId = 1; // fallback if endpoint doesn't exist
          }
        }

        if (!carrierId || !serviceId) {
          // Try carriers endpoint - if it fails, use null (no defaults)
          try {
            const carriersRes = await fetch('https://api.europarcel.com/api/public/carriers', {
              method: 'GET',
              headers: {
                'X-API-Key': profile.eawb_api_key,
                'Content-Type': 'application/json',
              },
            });
            if (carriersRes.ok) {
              const carriersData = await carriersRes.json();
              const firstCarrier = carriersData?.data?.[0] || carriersData?.[0];
              carrierId = carrierId || firstCarrier?.id || firstCarrier?.carrier_id || null;

              if (carrierId && !serviceId) {
                try {
                  const servicesRes = await fetch(`https://api.europarcel.com/api/public/carriers/${carrierId}/services`, {
                    method: 'GET',
                    headers: {
                      'X-API-Key': profile.eawb_api_key,
                      'Content-Type': 'application/json',
                    },
                  });
                  if (servicesRes.ok) {
                    const servicesData = await servicesRes.json();
                    const firstService = servicesData?.data?.[0] || servicesData?.[0];
                    serviceId = firstService?.id || firstService?.service_id || null;
                  }
                } catch {
                  // Services endpoint may not exist, leave serviceId as null
                }
              }
            }
          } catch {
            // Carriers endpoint may not exist, leave as null
          }
        }
      } catch (autoErr) {
        console.error('Auto-resolve IDs failed:', autoErr);
      }

      // Check billing address ID first
      if (!billingAddressId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_BILLING_ADDRESS',
          message: 'Please set your Billing Address ID in Store Settings → Delivery (eAWB.ro). Contact eAWB support or check browser DevTools in your EuroParcel account to find this ID.',
          details: { 
            billing_address_id: billingAddressId,
            help: 'This is a numeric ID from your EuroParcel account that identifies your billing address'
          }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // For calculate_prices, try to get all available options if carrier/service not set
      if (!carrierId || !serviceId) {
        console.log('Carrier/Service IDs not set, will try to get all available options from eAWB API');
        // Don't return error here - let the API call proceed to get available options
      }

      const priceRequest = {
        billing_to: {
          billing_address_id: billingAddressId
        },
        address_from: {
          country_code: senderLoc.country_code,
          county_name: senderLoc.county_name,
          locality_name: senderLoc.locality_name,
          locality_id: senderLoc.locality_id,
          contact: profile.eawb_name || 'Sender',
          street_name: senderStreet.street_name,
          street_number: senderStreet.street_number,
          phone: profile.eawb_phone || '0700000000',
          email: profile.eawb_email || 'sender@example.com'
        },
        address_to: {
          country_code: recipientLoc.country_code,
          county_name: recipientLoc.county_name,
          locality_name: recipientLoc.locality_name,
          locality_id: recipientLoc.locality_id,
          contact: order.customer_name,
          street_name: recipientStreet.street_name,
          street_number: recipientStreet.street_number,
          phone: order.customer_phone || '0700000001',
          email: order.customer_email
        },
        content: {
          parcels_count: 1,
          pallets_count: 0,
          envelopes_count: 0,
          total_weight: packageDetails.weight,
          parcels: [{
            sequence_no: 1,
            size: {
              length: packageDetails.length,
              width: packageDetails.width,
              height: packageDetails.height,
              weight: packageDetails.weight
            },
            declared_value: packageDetails.declared_value
          }]
        },
        extra: {
          parcel_content: packageDetails.contents || 'Merchandise'
        },
        cod_amount: packageDetails.cod_amount > 0 ? packageDetails.cod_amount : null,
        options: {
          saturday_delivery: false,
          sunday_delivery: false,
          morning_delivery: false
        },
        ...(carrierId && { carrier_id: carrierId }),
        ...(serviceId && { service_id: serviceId })
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
        console.error('eAWB Price API failed:', priceResponse.status, priceResult);
        const errorDetails = priceResult?.errors || priceResult?.details || priceResult?.message || priceResult;
        return new Response(JSON.stringify({ 
          success: false, 
          error: `Price API failed (${priceResponse.status})`,
          message: priceResult?.message || 'Price calculation failed',
          details: errorDetails,
          api_response: priceResult
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Transform the response to a consistent format
      const carrierOptions = priceResult.data?.map((option: any) => ({
        carrier_id: option.carrier_id,
        carrier_name: option.carrier,
        service_id: option.service_id,
        service_name: option.service_name,
        price: option.price?.total || option.price?.amount || 0,
        currency: option.price?.currency || 'RON',
        delivery_time: `${option.estimated_pickup_date} → ${option.estimated_delivery_date}`,
        cod_available: true, // Most eAWB services support COD
        estimated_pickup_date: option.estimated_pickup_date,
        estimated_delivery_date: option.estimated_delivery_date
      })) || [];

      return new Response(JSON.stringify({ 
        success: true, 
        carrier_options: carrierOptions,
        validation_address: priceResult.validation_address
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'create_order') {
      // Get order details
      const { data: order, error: orderError } = await sb
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
        return new Response(JSON.stringify({ success: false, error: 'Order not found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Create eAWB order using the selected carrier
      const senderLoc2 = await resolveLocality(profile.eawb_api_key, 'RO', profile.eawb_address || '');
      const recipientLoc2 = await resolveLocality(profile.eawb_api_key, 'RO', order.customer_address || '');
      if (!senderLoc2 || !recipientLoc2) {
        return new Response(
          JSON.stringify({ success: false, error: 'ADDRESS_VALIDATION_FAILED', details: { senderLoc: senderLoc2, recipientLoc: recipientLoc2 } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const senderStreet2 = extractStreetInfo(profile.eawb_address || '');
      const recipientStreet2 = extractStreetInfo(order.customer_address || '');

      const eawbOrderData = {
        billing_to: profile.eawb_billing_address_id ? {
          billing_address_id: profile.eawb_billing_address_id
        } : undefined,
        address_from: {
          country_code: senderLoc2.country_code,
          county_name: senderLoc2.county_name,
          locality_name: senderLoc2.locality_name,
          locality_id: senderLoc2.locality_id,
          contact: profile.eawb_name || 'Your Company',
          street_name: senderStreet2.street_name,
          street_number: senderStreet2.street_number,
          phone: profile.eawb_phone || '0700000000',
          email: profile.eawb_email || 'sender@example.com'
        },
        address_to: {
          country_code: recipientLoc2.country_code,
          county_name: recipientLoc2.county_name,
          locality_name: recipientLoc2.locality_name,
          locality_id: recipientLoc2.locality_id,
          contact: order.customer_name,
          street_name: recipientStreet2.street_name,
          street_number: recipientStreet2.street_number,
          phone: order.customer_phone || '0700000001',
          email: order.customer_email
        },
        content: {
          parcels_count: 1,
          pallets_count: 0,
          envelopes_count: 0,
          total_weight: packageDetails.weight,
          parcels: [{
            sequence_no: 1,
            size: {
              length: packageDetails.length,
              width: packageDetails.width,
              height: packageDetails.height,
              weight: packageDetails.weight
            },
            declared_value: packageDetails.declared_value
          }]
        },
        extra: {
          parcel_content: packageDetails.contents || 'Merchandise'
        },
        carrier_id: selectedCarrier.carrier_id,
        service_id: selectedCarrier.service_id,
        cod_amount: packageDetails.cod_amount > 0 ? packageDetails.cod_amount : null,
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
        return new Response(JSON.stringify({ success: false, error: eawbResult?.message || 'Create order failed', details: eawbResult }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Update order with AWB number and shipping info
      if (eawbResult.data && eawbResult.data.awb_number) {
        const { error: updateError } = await sb
          .from('orders')
          .update({
            awb_number: eawbResult.data.awb_number,
            carrier_name: eawbResult.data.carrier,
            tracking_url: eawbResult.data.track_url,
            estimated_delivery_date: eawbResult.data.estimated_delivery_date ? 
              eawbResult.data.estimated_delivery_date.split('-').reverse().join('-') : null,
            shipping_status: 'processing'
          })
          .eq('id', orderId)
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Error updating order with AWB info:', updateError);
        } else {
          console.log('Successfully updated order with AWB information');
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        awb_number: eawbResult.data?.awb_number,
        order_id: eawbResult.data?.order_id,
        carrier: eawbResult.data?.carrier,
        service_name: eawbResult.data?.service_name,
        price: eawbResult.data?.price,
        track_url: eawbResult.data?.track_url,
        estimated_pickup_date: eawbResult.data?.estimated_pickup_date,
        estimated_delivery_date: eawbResult.data?.estimated_delivery_date,
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

    } else if (action === 'cancel_order') {
      // Get order details to get AWB number
      const { data: order, error: orderError } = await sb
        .from('orders')
        .select('awb_number, shipping_status')
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      if (orderError || !order) {
        return new Response(JSON.stringify({ success: false, error: 'Order not found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!order.awb_number) {
        return new Response(JSON.stringify({ success: false, error: 'No AWB number found for this order' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (order.shipping_status === 'delivered' || order.shipping_status === 'cancelled') {
        return new Response(JSON.stringify({ success: false, error: 'Cannot cancel order that is already delivered or cancelled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log('Cancelling eAWB order with AWB:', order.awb_number);

      // Call eAWB cancel API
      const cancelResponse = await fetch(`https://api.europarcel.com/api/public/orders/cancel`, {
        method: 'POST', 
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': profile.eawb_api_key,
        },
        body: JSON.stringify({
          awb: order.awb_number
        }),
      });

      // Safely parse response (may not be JSON)
      const contentType = cancelResponse.headers.get('content-type') || '';
      let cancelResult: any = null;
      let rawText: string | null = null;
      if (contentType.includes('application/json')) {
        cancelResult = await cancelResponse.json();
      } else {
        rawText = await cancelResponse.text();
        try {
          cancelResult = JSON.parse(rawText);
        } catch {
          cancelResult = { raw: rawText };
        }
      }
      console.log('eAWB Cancel API response:', JSON.stringify(cancelResult, null, 2));

      if (!cancelResponse.ok) {
        console.error('eAWB Cancel API failed:', cancelResponse.status, cancelResult);
        return new Response(JSON.stringify({ 
          success: false, 
          error: `Cancel API failed (${cancelResponse.status})`,
          message: (cancelResult && (cancelResult.message || cancelResult.error)) || 'Failed to cancel AWB',
          details: cancelResult 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Update order shipping status to cancelled
      const { error: updateError } = await sb
        .from('orders')
        .update({
          shipping_status: 'cancelled'
        })
        .eq('id', orderId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error updating order status after AWB cancellation:', updateError);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'AWB cancelled but failed to update order status',
          details: updateError 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'AWB cancelled successfully',
        awb_number: order.awb_number,
        cancel_response: cancelResult 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      throw new Error('Invalid action. Use "calculate_prices", "create_order", "track_order", or "cancel_order"');
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