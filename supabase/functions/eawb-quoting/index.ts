import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { order_id, package_details, address_override } = await req.json();
    console.log('=== eAWB Quoting Request ===');
    console.log('Order ID:', order_id);
    console.log('Package details:', package_details);
    console.log('Address override:', address_override);

    // Get the user from auth header
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    // Fetch order and user profile
    const [orderResult, profileResult] = await Promise.all([
      supabase.from('orders').select('*').eq('id', order_id).eq('user_id', user.id).single(),
      supabase.from('profiles').select('*').eq('user_id', user.id).single()
    ]);

    if (orderResult.error) throw new Error('Order not found');
    if (profileResult.error) throw new Error('Profile not found');

    const order = orderResult.data;
    const profile = profileResult.data;

    // Check if user has eAWB API key
    if (!profile.eawb_api_key) {
      return new Response(JSON.stringify({
        success: false,
        error: 'MISSING_API_KEY',
        message: 'eAWB API key not configured. Please configure it in Store Settings.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Address normalization functions
    function removeDiacritics(str: string): string {
      return str
        .replace(/[ăâ]/g, 'a')
        .replace(/[ĂÂ]/g, 'A')
        .replace(/[îi]/g, 'i')
        .replace(/[ÎI]/g, 'I')
        .replace(/[șş]/g, 's')
        .replace(/[ȘŞ]/g, 'S')
        .replace(/[țţ]/g, 't')
        .replace(/[ȚŢ]/g, 'T');
    }

    function parseRomanianAddress(address: string) {
      const normalized = removeDiacritics(address.toLowerCase().trim());
      console.log('Parsing address:', address, '-> normalized:', normalized);
      
      // Remove apartment/floor info
      const cleanAddress = normalized
        .replace(/,?\s*(ap\.?\s*\d+|apartament\s*\d+|etaj\s*\d+|et\.?\s*\d+)/gi, '')
        .replace(/,+/g, ',')
        .replace(/,\s*,/g, ',')
        .trim();
      
      console.log('Clean address:', cleanAddress);
      
      // Split by comma and filter empty parts
      const parts = cleanAddress.split(',').map(p => p.trim()).filter(p => p.length > 0);
      console.log('Address parts:', parts);
      
      let city = '';
      let county = '';
      let postal_code = '';
      
      // Extract postal code (5-6 digits)
      const postalMatch = address.match(/\b(\d{5,6})\b/);
      if (postalMatch) {
        postal_code = postalMatch[1];
        console.log('Found postal code:', postal_code);
      }
      
      // Handle Bucharest special case
      if (normalized.includes('bucuresti') || normalized.includes('bucharest')) {
        city = 'Bucuresti';
        county = 'Bucuresti';
        console.log('Detected Bucharest');
        return { city, county, postal_code };
      }
      
      // For other addresses, try to extract city/county from the last parts
      if (parts.length >= 2) {
        // Usually: street, city, county or city, county
        city = parts[parts.length - 2];
        county = parts[parts.length - 1];
      } else if (parts.length === 1) {
        // Only one part, assume it's the city
        city = parts[0];
      }
      
      // Clean up city and county
      city = city.replace(/^(str\.?\s*|strada\s*|bd\.?\s*|bulevardul\s*|cal\.?\s*|calea\s*)/i, '').trim();
      county = county.replace(/^(jud\.?\s*|judetul\s*)/i, '').trim();
      
      // Capitalize first letter
      city = city.charAt(0).toUpperCase() + city.slice(1);
      county = county.charAt(0).toUpperCase() + county.slice(1);
      
      console.log('Parsed result:', { city, county, postal_code });
      return { city, county, postal_code };
    }

    function extractStreetInfo(fullAddress: string) {
      const firstPart = (fullAddress || '').split(',')[0] || '';
      const match = firstPart.match(/^(.*?)(\s+(\d+[A-Za-z\/-]*))?$/);
      const street_name = (match?.[1] || firstPart).trim();
      const street_number = (match?.[3] || '').trim();
      return { street_name, street_number };
    }

    // Parse addresses
    const senderAddress = parseRomanianAddress(profile.eawb_address || 'Bucuresti, Romania');
    const recipientAddress = address_override || parseRomanianAddress(order.customer_address);
    
    console.log('Sender address parsed:', senderAddress);
    console.log('Recipient address parsed:', recipientAddress);

    // Get all active carriers and their services
    const { data: carriers, error: carriersError } = await supabase
      .from('carriers')
      .select(`
        id,
        name,
        code,
        logo_url,
        is_active,
        api_base_url,
        carrier_services (
          id,
          name,
          service_code,
          description,
          is_active
        )
      `)
      .eq('is_active', true);

    if (carriersError) {
      console.log('Carriers fetch error:', carriersError);
      throw new Error('Failed to fetch carriers');
    }
    console.log(`Found ${carriers.length} active carriers`);

    const BASE_URL = 'https://api.europarcel.com/api/public';


    async function loadEawbCatalogue(apiKey: string) {
      const headers = { 'X-API-Key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' } as const;
      try {
        const [carRes, srvRes] = await Promise.all([
          fetch(`${BASE_URL}/carriers`, { method: 'GET', headers }),
          fetch(`${BASE_URL}/services`, { method: 'GET', headers })
        ]);
        const carriersJson = await carRes.json().catch(() => ({}));
        const servicesJson = await srvRes.json().catch(() => ({}));
        const carriers = Array.isArray(carriersJson?.data) ? carriersJson.data : (Array.isArray(carriersJson) ? carriersJson : []);
        const services = Array.isArray(servicesJson?.data) ? servicesJson.data : (Array.isArray(servicesJson) ? servicesJson : []);
        return { carriers, services };
      } catch (e) {
        console.log('Failed to load eAWB catalogue:', e?.message || e);
        return { carriers: [], services: [] };
      }
    }

    const { carriers: eawbCarriers, services: eawbServices } = await loadEawbCatalogue(profile.eawb_api_key);
    console.log(`Loaded eAWB catalogue: carriers=${eawbCarriers?.length || 0}, services=${eawbServices?.length || 0}`);

    const carrierQuotes = [];
    const attemptResults = [];


    // Build parcel data
    const parcel = {
      weight: package_details.weight || 1,
      length: package_details.length || 30,
      width: package_details.width || 20,
      height: package_details.height || 10,
      declared_value: package_details.declared_value || order.total
    };

    // Build simple street info
    const senderStreet = extractStreetInfo(profile.eawb_address || '');
    const recipientStreet = extractStreetInfo(order.customer_address || '');

    // Use configured billing address or fallback to 1
    const billingAddressId = (profile.eawb_billing_address_id && profile.eawb_billing_address_id > 0)
      ? profile.eawb_billing_address_id
      : 1;

    // Try each carrier/service combination
    for (const carrier of carriers) {
      if (!carrier.carrier_services || carrier.carrier_services.length === 0) continue;

      console.log(`Processing carrier: ${carrier.name} (${carrier.code})`);

      for (const service of carrier.carrier_services) {
        if (service.is_active === false) continue;

        // Map our DB carrier/service to eAWB integer IDs
        const carrierCode = String(carrier.code || '').toLowerCase();
        const carrierNameLc = String(carrier.name || '').toLowerCase();
        const eawbCarrierList = Array.isArray(eawbCarriers) ? eawbCarriers : [];
        const eawbCarrier = eawbCarrierList.find((c: any) => {
          const cCode = String(c.code || '').toLowerCase();
          const cName = String(c.name || '').toLowerCase();
          return (carrierCode && cCode === carrierCode) || cName === carrierNameLc;
        });
        const eawbCarrierId = Number(eawbCarrier?.id) || Number(carrier.id) || 0;

        let eawbServiceId = Number.parseInt(String(service.service_code));
        if (!Number.isFinite(eawbServiceId)) {
          const eawbServiceList = Array.isArray(eawbServices) ? eawbServices : [];
          const svc = eawbServiceList.find((s: any) => {
            const sCode = String(s.code || '').toLowerCase();
            const sName = String(s.name || '').toLowerCase();
            return (Number(s.carrier_id) === eawbCarrierId) && (
              (service.service_code && sCode === String(service.service_code).toLowerCase()) ||
              sName === String(service.name || '').toLowerCase()
            );
          });
          eawbServiceId = Number(svc?.id);
        }

        const attemptResult = {
          carrier_name: carrier.name,
          carrier_id: eawbCarrierId,
          service_id: eawbServiceId,
          service_name: service.name,
          request_url: '',
          success: false,
          error: null as string | null,
        };

        try {
          console.log(`Calculating prices for ${carrier.name} - ${service.name}`);

          // Validate mapping before requesting price
          if (!Number.isFinite(eawbServiceId) || eawbCarrierId <= 0) {
            attemptResult.error = 'Invalid carrier/service mapping';
            attemptResult.success = false;
            attemptResults.push(attemptResult);
            continue;
          }

          const priceRequest = {
            billing_to: { billing_address_id: billingAddressId },
            address_from: {
              country_code: 'RO',
              county_name: senderAddress.county,
              locality_name: senderAddress.city,
              postal_code: senderAddress.postal_code || undefined,
              contact: profile.eawb_name || profile.store_name || 'Sender',
              street_name: senderStreet.street_name,
              street_number: senderStreet.street_number,
              phone: profile.eawb_phone || profile.phone || '0700000000',
              email: profile.eawb_email || profile.email || user.email
            },
            address_to: {
              country_code: 'RO',
              county_name: recipientAddress.county,
              locality_name: recipientAddress.city,
              postal_code: recipientAddress.postal_code || undefined,
              contact: order.customer_name,
              street_name: recipientStreet.street_name,
              street_number: recipientStreet.street_number,
              phone: order.customer_phone || '0700000000',
              email: order.customer_email
            },
            parcels: [
              {
                length: parcel.length,
                width: parcel.width,
                height: parcel.height,
                weight: parcel.weight,
                declared_value: parcel.declared_value
              }
            ],
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
            carrier_id: attemptResult.carrier_id,
            service_id: attemptResult.service_id
          };

          const url = `${BASE_URL}/calculate-prices`;
          attemptResult.request_url = url;

          console.log(`Making request to: ${url} for ${carrier.name} - ${service.name}`);
          console.log(`Request payload:`, JSON.stringify(priceRequest, null, 2));

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'X-API-Key': profile.eawb_api_key,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(priceRequest)
          });

          console.log(`Response status: ${response.status} for ${carrier.name} - ${service.name}`);

          const responseText = await response.text();
          console.log(`Raw response from ${carrier.name} (${response.status}):`, responseText.substring(0, 500));

          let result;
          try {
            result = JSON.parse(responseText);
          } catch (parseError) {
            throw new Error(`Invalid JSON response from ${carrier.name}: ${responseText.substring(0, 200)}`);
          }

          console.log(`Price response for ${carrier.name} - ${service.name}:`, {
            status: response.status,
            success: result?.success,
            message: result?.message,
            data_length: Array.isArray(result?.data) ? result.data.length : 0
          });

          if (response.ok && result?.success && Array.isArray(result.data) && result.data.length > 0) {
            const d = result.data[0];
            attemptResult.success = true;

            carrierQuotes.push({
            carrier_info: {
                id: attemptResult.carrier_id,
                name: carrier.name,
                logo_url: carrier.logo_url
              },
              service_info: {
                id: attemptResult.service_id,
                name: service.name,
                description: service.description || ''
              },
              price: {
                amount: parseFloat(d?.price?.amount ?? d?.price_amount ?? 0) || 0,
                vat: parseFloat(d?.price?.vat ?? d?.price_vat ?? 0) || 0,
                total: parseFloat(d?.price?.total ?? d?.price_total ?? 0) || 0,
                currency: d?.price?.currency || d?.currency || 'RON'
              },
              estimated_pickup_date: d?.estimated_pickup_date || 'Next business day',
              estimated_delivery_date: d?.estimated_delivery_date || '2-3 business days',
              carrier_id: attemptResult.carrier_id,
              service_id: attemptResult.service_id
            });
          } else {
            attemptResult.error = result?.message || `HTTP ${response.status}`;
          }
        } catch (err: any) {
          attemptResult.error = err.message;
        }

        attemptResults.push(attemptResult);
      }
    }

    console.log(`=== Results: ${carrierQuotes.length} total quotes from ${attemptResults.filter(a => a.success).length} carriers ===`);

    if (carrierQuotes.length > 0) {
      return new Response(JSON.stringify({
        success: true,
        carrier_options: carrierQuotes,
        debug_info: {
          sender_address: senderAddress,
          recipient_address: recipientAddress,
          parcel_info: parcel,
          attempts: attemptResults
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: 'NO_QUOTES',
        message: 'No shipping quotes available',
        debug_info: {
          sender_address: senderAddress,
          recipient_address: recipientAddress,
          parcel_info: parcel,
          attempts: attemptResults
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error: any) {
    console.error('Error in eawb-quoting:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});