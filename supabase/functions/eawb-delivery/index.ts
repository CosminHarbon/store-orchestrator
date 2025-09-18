import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    let requestBody;
    try {
      requestBody = await req.json();
      console.log('Raw request body:', requestBody);
    } catch (jsonError) {
      console.error('JSON parsing error:', jsonError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid JSON in request body',
        details: jsonError.message
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const { action, order_id, package_details, selected_carrier, selected_service } = requestBody;
    console.log('Action received:', action)
    console.log('Request body:', { action, order_id, package_details, selected_carrier, selected_service })

    // Get authenticated user
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // Locality resolution function
    const resolveLocality = async (apiKey: string, countryCode: string, address: string) => {
      try {
        const response = await fetch('https://api.europarcel.com/api/public/localities', {
          method: 'POST',
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            country_code: countryCode,
            search_text: address
          })
        });

        if (!response.ok) {
          console.error('Locality API failed:', response.status, await response.text());
          return null;
        }

        const data = await response.json();
        console.log('Locality API response:', data);
        
        if (data.success && data.data && data.data.length > 0) {
          return data.data[0];
        }
        
        return null;
      } catch (error) {
        console.error('Locality resolution error:', error);
        return null;
      }
    };

    // Street info extraction function
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

    const extractCityCounty = (address: string) => {
      const parts = address.split(',').map(p => p.trim());
      // Expect formats like: street, City, County, Country
      const city = parts[1] || parts[0] || '';
      const county = parts[2] || '';
      return { city, county };
    };

    const buildParcels = (pkg: any) => {
      const count = Math.max(1, Number(pkg?.parcels || 1));
      const parcel = {
        weight: Number(pkg?.weight || 1),
        length: Number(pkg?.length || 30),
        width: Number(pkg?.width || 20),
        height: Number(pkg?.height || 10),
        contents: String(pkg?.contents || 'Goods'),
        declared_value: Number(pkg?.declared_value || 0),
        cod_amount: pkg?.cod_amount ? Number(pkg.cod_amount) : undefined
      };
      return Array.from({ length: count }, () => parcel);
    };
    if (action === 'calculate_prices') {
      // Get user profile
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      console.log('Profile fetch result:', { profile: !!profile, error: profileError })

      if (profileError || !profile || !profile.eawb_api_key) {
        console.error('Profile error:', profileError)
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Missing eAWB configuration. Please configure your eAWB settings first.',
          details: { profileError, hasProfile: !!profile, hasApiKey: !!profile?.eawb_api_key }
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Get order
      const { data: order, error: orderError } = await supabaseClient
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .eq('user_id', user.id)
        .single()

      console.log('Order fetch result:', { order: !!order, error: orderError, order_id })

      if (orderError || !order) {
        console.error('Order error:', orderError)
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Order not found',
          details: { orderError, order_id, user_id: user.id }
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Get all active carriers and services
      const { data: carriers, error: carriersError } = await supabaseClient
        .from('carriers')
        .select(`
          id,
          name,
          code,
          logo_url,
          carrier_services (
            id,
            name,
            service_code,
            description
          )
        `)
        .eq('is_active', true)

      if (carriersError || !carriers || carriers.length === 0) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'No carriers available' 
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
      }

      // Resolve sender and recipient localities with robust fallbacks
      console.log(`Resolving sender locality for: "${profile.eawb_address}"`)
      const { city: senderCity, county: senderCounty } = extractCityCounty(profile.eawb_address || '')
      let senderLocalityResult = await resolveLocality(profile.eawb_api_key, 'RO', profile.eawb_address || '')
      if (!senderLocalityResult && senderCity) {
        senderLocalityResult = await resolveLocality(profile.eawb_api_key, 'RO', `${senderCity} ${senderCounty}`.trim())
      }
      if (!senderLocalityResult && senderCity) {
        senderLocalityResult = await resolveLocality(profile.eawb_api_key, 'RO', senderCity)
      }

      if (!senderLocalityResult) {
        console.warn('Locality not resolved for sender, falling back to city/county only')
      }

      console.log(`Resolving recipient locality for: "${order.customer_address}"`)
      const { city: recipientCity, county: recipientCounty } = extractCityCounty(order.customer_address || '')
      let recipientLocalityResult = await resolveLocality(profile.eawb_api_key, 'RO', order.customer_address || '')
      if (!recipientLocalityResult && recipientCity) {
        recipientLocalityResult = await resolveLocality(profile.eawb_api_key, 'RO', `${recipientCity} ${recipientCounty}`.trim())
      }
      if (!recipientLocalityResult && recipientCity) {
        recipientLocalityResult = await resolveLocality(profile.eawb_api_key, 'RO', recipientCity)
      }

      if (!recipientLocalityResult) {
        console.warn('Locality not resolved for recipient, falling back to city/county only')
      }

      // Extract street info
      const senderStreetInfo = extractStreetInfo(profile.eawb_address || '')
      const recipientStreetInfo = extractStreetInfo(order.customer_address || '')

      // Build address objects
      const senderAddress = {
        country_code: 'RO',
        county_name: senderLocalityResult?.county_name || senderCounty || '',
        locality_name: senderLocalityResult?.locality_name || senderCity || '',
        locality_id: senderLocalityResult?.locality_id,
        contact: profile.eawb_name || 'Sender',
        street_name: senderStreetInfo.street_name,
        street_number: senderStreetInfo.street_number,
        phone: profile.eawb_phone || '0700000000',
        email: profile.eawb_email || 'sender@example.com'
      }

      const recipientAddress = {
        country_code: 'RO', 
        county_name: recipientLocalityResult?.county_name || recipientCounty || '',
        locality_name: recipientLocalityResult?.locality_name || recipientCity || '',
        locality_id: recipientLocalityResult?.locality_id,
        contact: order.customer_name,
        street_name: recipientStreetInfo.street_name,
        street_number: recipientStreetInfo.street_number,
        phone: order.customer_phone || '0700000000',
        email: order.customer_email
      }

      // Get billing address ID
      let billingAddressId: number | null = (profile.eawb_billing_address_id && profile.eawb_billing_address_id > 0)
        ? profile.eawb_billing_address_id
        : null

      // Auto-resolve billing address if missing
      if (!billingAddressId) {
        try {
          const baRes = await fetch('https://api.europarcel.com/api/public/billing-addresses', {
            method: 'GET',
            headers: {
              'X-API-Key': profile.eawb_api_key,
              'Content-Type': 'application/json',
            },
          })
          if (baRes.ok) {
            const baData = await baRes.json()
            const first = baData?.data?.[0] || baData?.[0]
            billingAddressId = (first?.id ?? first?.billing_address_id) || 1
          } else {
            billingAddressId = 1
          }
        } catch {
          billingAddressId = 1
        }
      }

      // Calculate prices for all carrier/service combinations
      const allQuotes = []
      
      for (const carrier of carriers) {
        // Calculate prices for all active carriers that have services
        if (!carrier.carrier_services || carrier.carrier_services.length === 0) {
          continue
        }

        for (const service of carrier.carrier_services) {
          const priceRequest = {
            billing_to: {
              billing_address_id: billingAddressId
            },
            address_from: senderAddress,
            address_to: recipientAddress,
            parcels: buildParcels(package_details),
            service: {
              currency: 'RON',
              payment_type: '1',
              send_invoice: false,
              allow_bank_to_open: false,
              fragile: false,
              pickup_available: false,
              allow_saturday_delivery: false,
              sunday_delivery: false,
              morning_delivery: false
            },
            carrier_id: carrier.id,
            service_id: parseInt(service.service_code)
          }

          console.log(`Calculating prices for ${carrier.name} - ${service.name}:`, priceRequest)

          try {
            const response = await fetch('https://api.europarcel.com/api/public/calculate-prices', {
              method: 'POST',
              headers: {
                'X-API-Key': profile.eawb_api_key,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(priceRequest)
            })

            const result = await response.json()
            console.log(`Price response for ${carrier.name} - ${service.name}:`, result)

            if (response.ok && result.success && result.data?.length > 0) {
              const priceData = result.data[0]
              
              allQuotes.push({
                carrier_id: carrier.id,
                carrier_name: carrier.name,
                carrier_logo: carrier.logo_url,
                service_id: parseInt(service.service_code),
                service_name: service.name,
                service_description: service.description,
                price: priceData.price?.total || 0,
                currency: priceData.price?.currency || 'RON',
                delivery_time: `${priceData.estimated_pickup_date} → ${priceData.estimated_delivery_date}`,
                estimated_pickup_date: priceData.estimated_pickup_date,
                estimated_delivery_date: priceData.estimated_delivery_date
              })
            } else {
              console.log(`Failed to get price for ${carrier.name} - ${service.name}:`, result)
            }
          } catch (error) {
            console.error(`Price calculation error for ${carrier.name} - ${service.name}:`, error)
          }
        }
      }

      if (allQuotes.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'NO_QUOTES',
          message: 'No carrier returned a price for the provided addresses and parcels',
          details: {
            senderAddress,
            recipientAddress,
            carriers: carriers.map((c:any) => ({ id: c.id, name: c.name, services: c.carrier_services?.map((s:any)=>s.service_code) }))
          }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      return new Response(
        JSON.stringify({ success: true, carrier_options: allQuotes }),
        { headers: corsHeaders }
      )

    } else if (action === 'create_order') {
      // Get user profile
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (profileError || !profile || !profile.eawb_api_key) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Missing eAWB configuration' 
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
      }

      // Get order
      const { data: order, error: orderError } = await supabaseClient
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .eq('user_id', user.id)
        .single()

      if (orderError || !order) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Order not found' 
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
      }

      // Create eAWB order using the selected carrier
      const senderLoc = await resolveLocality(profile.eawb_api_key, 'RO', profile.eawb_address || '')
      const recipientLoc = await resolveLocality(profile.eawb_api_key, 'RO', order.customer_address || '')
      
      if (!senderLoc || !recipientLoc) {
        return new Response(
          JSON.stringify({ success: false, error: 'ADDRESS_VALIDATION_FAILED', details: { senderLoc, recipientLoc } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const senderStreet = extractStreetInfo(profile.eawb_address || '')
      const recipientStreet = extractStreetInfo(order.customer_address || '')

      const eawbOrderData = {
        billing_to: profile.eawb_billing_address_id ? {
          billing_address_id: profile.eawb_billing_address_id
        } : undefined,
        address_from: {
          country_code: senderLoc.country_code,
          county_name: senderLoc.county_name,
          locality_name: senderLoc.locality_name,
          locality_id: senderLoc.locality_id,
          contact: profile.eawb_name || 'Your Company',
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
          phone: order.customer_phone || '0700000000',
          email: order.customer_email
        },
        parcels: package_details.parcels,
        service: {
          currency: 'RON',
          payment_type: '1',
          send_invoice: false,
          allow_bank_to_open: false,
          fragile: false,
          pickup_available: false,
          allow_saturday_delivery: false,
          sunday_delivery: false,
          morning_delivery: false
        },
        carrier_id: selected_carrier,
        service_id: selected_service
      }

      console.log('Creating eAWB order:', JSON.stringify(eawbOrderData, null, 2))

      const response = await fetch('https://api.europarcel.com/api/public/orders', {
        method: 'POST',
        headers: {
          'X-API-Key': profile.eawb_api_key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eawbOrderData)
      })

      const result = await response.json()
      console.log('eAWB order creation response:', result)

      if (!response.ok || !result.success) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Failed to create eAWB order',
          details: result
        }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
      }

      // Get carrier name for the order
      const { data: carrierData } = await supabaseClient
        .from('carriers')
        .select('name')
        .eq('id', selected_carrier)
        .single()

      // Update order with AWB details
      const { error: updateError } = await supabaseClient
        .from('orders')
        .update({
          awb_number: result.data?.awb_number,
          carrier_name: carrierData?.name || 'Unknown',
          tracking_url: result.data?.tracking_url,
          estimated_delivery_date: result.data?.estimated_delivery_date,
          shipping_status: 'processing'
        })
        .eq('id', order_id)

      if (updateError) {
        console.error('Failed to update order:', updateError)
      }

      return new Response(JSON.stringify({ 
        success: true, 
        awb_number: result.data?.awb_number,
        tracking_url: result.data?.tracking_url
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    return new Response(JSON.stringify({ success: false, error: 'Invalid action' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in eawb-delivery function:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})