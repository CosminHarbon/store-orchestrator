import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { resolveActingOwnerId } from '../_shared/actingAs.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EAWB_BASE_URL = 'https://api.europarcel.com/api/public';

/** eAWB returns DD-MM-YYYY; Postgres DATE requires YYYY-MM-DD. */
function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${month}-${day}`;
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== eAWB Delivery Service ===');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const {
      action,
      order_id: orderIdFromBody,
      orderId,
      package_details,
      selected_carrier,
      selected_service,
      address_override,
      carrier_id,
      city,
      county
    } = body;
    const order_id = orderIdFromBody || orderId;
    console.log('Request:', { action, order_id, selected_carrier, selected_service, carrier_id, city, county });

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    const ownerId = await resolveActingOwnerId(
      supabase,
      user,
      authHeader,
      body.acting_as_user_id || null
    );

    // Fetch billing addresses from eAWB API
    if (action === 'fetch_billing_addresses') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('eawb_api_key')
        .eq('user_id', ownerId)
        .single();

      if (!profile?.eawb_api_key) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_API_KEY',
          message: 'eAWB API key not configured'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const billingUrl = `${EAWB_BASE_URL}/addresses/billing?all=true`;
      console.log('=== Fetching Billing Addresses ===');
      console.log('URL:', billingUrl);

      const billingResponse = await fetch(billingUrl, {
        method: 'GET',
        headers: {
          'X-API-Key': profile.eawb_api_key,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      const billingText = await billingResponse.text();
      console.log('Billing response status:', billingResponse.status);
      console.log('Billing raw response:', billingText);

      let billingData: any = null;
      try {
        billingData = JSON.parse(billingText);
      } catch (_e) {
        return new Response(JSON.stringify({
          success: false,
          error: 'EAWB_API_ERROR',
          message: `eAWB returned a non-JSON response (status ${billingResponse.status})`,
          details: billingText.slice(0, 300)
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!billingResponse.ok) {
        console.error('Billing addresses fetch failed:', billingResponse.status, billingText);
        return new Response(JSON.stringify({
          success: false,
          error: 'FETCH_FAILED',
          message: billingData?.message || 'Failed to fetch billing addresses from eAWB API',
          details: billingData,
          status: billingResponse.status
        }), {
          status: billingResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const billingList = Array.isArray(billingData?.list)
        ? billingData.list
        : (Array.isArray(billingData?.data?.list) ? billingData.data.list : (Array.isArray(billingData?.data) ? billingData.data : []));

      console.log('Parsed billing addresses count:', billingList.length);
      console.log('Parsed billing addresses:', JSON.stringify(billingList));

      if (billingList.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'NO_BILLING_ADDRESS',
          message: 'No billing address found in your Europarcel/eAWB account. Please create one in your Europarcel dashboard.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Auto-save when there is exactly one billing address (or one marked default)
      let savedId: number | null = null;
      const defaultAddress = billingList.find((a: any) => a.is_default);
      const autoSelect = billingList.length === 1 ? billingList[0] : defaultAddress;
      if (autoSelect?.id) {
        savedId = Number(autoSelect.id);
        await supabase
          .from('profiles')
          .update({ eawb_billing_address_id: savedId })
          .eq('user_id', ownerId);
        console.log('Auto-saved billing_address_id:', savedId);
      }

      return new Response(JSON.stringify({
        success: true,
        billing_addresses: billingList,
        selected_billing_address_id: savedId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch shipping (pickup) addresses from eAWB API (GET /addresses/shipping)
    if (action === 'fetch_shipping_addresses') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('eawb_api_key')
        .eq('user_id', ownerId)
        .single();

      if (!profile?.eawb_api_key) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_API_KEY',
          message: 'eAWB API key not configured'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const shippingUrl = `${EAWB_BASE_URL}/addresses/shipping?all=true`;
      console.log('=== Fetching Shipping (Pickup) Addresses ===');
      console.log('URL:', shippingUrl);

      const shippingResponse = await fetch(shippingUrl, {
        method: 'GET',
        headers: {
          'X-API-Key': profile.eawb_api_key,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      const shippingText = await shippingResponse.text();
      console.log('Shipping response status:', shippingResponse.status);
      console.log('Shipping raw response:', shippingText);

      let shippingData: any = null;
      try {
        shippingData = JSON.parse(shippingText);
      } catch (_e) {
        return new Response(JSON.stringify({
          success: false,
          error: 'EAWB_API_ERROR',
          message: `eAWB returned a non-JSON response (status ${shippingResponse.status})`,
          details: shippingText.slice(0, 300)
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!shippingResponse.ok) {
        console.error('Shipping addresses fetch failed:', shippingResponse.status, shippingText);
        return new Response(JSON.stringify({
          success: false,
          error: 'FETCH_FAILED',
          message: shippingData?.message || 'Failed to fetch shipping addresses from eAWB API',
          details: shippingData,
          status: shippingResponse.status
        }), {
          status: shippingResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const shippingList = Array.isArray(shippingData?.list)
        ? shippingData.list
        : (Array.isArray(shippingData?.data?.list) ? shippingData.data.list : (Array.isArray(shippingData?.data) ? shippingData.data : []));

      console.log('Parsed shipping addresses count:', shippingList.length);

      if (shippingList.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'NO_SHIPPING_ADDRESS',
          message: 'No shipping (pickup) address found in your Europarcel/eAWB account. Please create one in your Europarcel dashboard before generating AWBs.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Auto-save only when exactly one shipping address is returned
      let savedId: number | null = null;
      if (shippingList.length === 1 && shippingList[0]?.id) {
        savedId = Number(shippingList[0].id);
        await supabase
          .from('profiles')
          .update({ eawb_shipping_address_id: savedId })
          .eq('user_id', ownerId);
        console.log('Auto-saved shipping_address_id:', savedId);
      }

      return new Response(JSON.stringify({
        success: true,
        shipping_addresses: shippingList,
        selected_shipping_address_id: savedId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'fetch_lockers') {
      // Fetch lockers for a specific carrier and location
      const { data: profile } = await supabase
        .from('profiles')
        .select('eawb_api_key')
        .eq('user_id', ownerId)
        .single();

      if (!profile?.eawb_api_key) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_API_KEY',
          message: 'eAWB API key not configured'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Build query parameters
      const params = new URLSearchParams({
        carrier_id: carrier_id.toString(),
        ...(city && { locality_name: city }),
        ...(county && { county_name: county })
      });

      console.log('Fetching lockers:', params.toString());

      const lockersResponse = await fetch(`${EAWB_BASE_URL}/lockers?${params}`, {
        headers: {
          'X-API-Key': profile.eawb_api_key,
          'Accept': 'application/json'
        }
      });

      if (!lockersResponse.ok) {
        const errorText = await lockersResponse.text();
        console.error('Lockers fetch failed:', lockersResponse.status, errorText);
        return new Response(JSON.stringify({
          success: false,
          error: 'FETCH_FAILED',
          message: 'Failed to fetch lockers from carrier API',
          details: errorText,
          status: lockersResponse.status
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const lockersData = await lockersResponse.json();
      console.log('=== RAW API RESPONSE ===');
      console.log('Response type:', Array.isArray(lockersData) ? 'array' : typeof lockersData);
      console.log('Response length:', Array.isArray(lockersData) ? lockersData.length : 'N/A');
      if (lockersData && lockersData.length > 0) {
        console.log('First locker sample:', JSON.stringify(lockersData[0], null, 2));
        console.log('Available fields:', Object.keys(lockersData[0]));
      }
      console.log('======================');

      // Transform the response to match expected format
      // Handle various possible field name variations
      const transformedLockers = (Array.isArray(lockersData) ? lockersData : []).map((locker: any) => ({
        id: locker.id || locker.locker_id || locker.lockerId || String(locker.code),
        name: locker.name || locker.locker_name || locker.lockerName || 'Unnamed Locker',
        address: locker.address || locker.street_address || locker.streetAddress || '',
        city: locker.city || locker.locality_name || locker.localityName || '',
        county: locker.county || locker.county_name || locker.countyName || '',
        latitude: locker.latitude || locker.lat || locker.coords?.lat || locker.coordinates?.latitude || 0,
        longitude: locker.longitude || locker.lng || locker.lon || locker.coords?.lng || locker.coordinates?.longitude || 0,
        carrier_id: carrier_id,
        available: locker.available !== false // Default to true unless explicitly false
      })).filter(l => l.latitude !== 0 && l.longitude !== 0); // Only include lockers with valid coordinates

      console.log(`Transformed ${transformedLockers.length} lockers with valid coordinates`);

      return new Response(JSON.stringify({
        success: true,
        lockers: transformedLockers
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'validate_pickup_locker') {
      const lockerId = body.locker_id || body.fixed_location_id;
      if (!lockerId) {
        return new Response(JSON.stringify({
          success: false,
          exists: false,
          error: 'MISSING_LOCKER_ID',
          message: 'locker_id is required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('eawb_api_key')
        .eq('user_id', ownerId)
        .single();

      if (!profile?.eawb_api_key) {
        return new Response(JSON.stringify({
          success: false,
          exists: false,
          error: 'MISSING_API_KEY',
          message: 'eAWB API key not configured'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const resp = await fetch(
          `${EAWB_BASE_URL}/locations/fixedlocations/${encodeURIComponent(String(lockerId))}`,
          {
            method: 'GET',
            headers: {
              'X-API-Key': profile.eawb_api_key,
              'Accept': 'application/json'
            }
          }
        );
        const raw = await resp.json();
        if (!resp.ok) {
          return new Response(JSON.stringify({
            success: false,
            exists: false,
            error: 'NOT_FOUND',
            message: 'Saved pickup locker no longer exists or is unavailable. Please select another one.',
            details: raw
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const lockerRaw = Array.isArray(raw) ? raw[0] : (raw?.data || raw);
        if (!lockerRaw || lockerRaw.is_active === false) {
          return new Response(JSON.stringify({
            success: false,
            exists: false,
            error: 'INACTIVE',
            message: 'Saved pickup locker is inactive. Please select another one.'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          exists: true,
          locker: {
            id: lockerRaw.id || lockerId,
            name: lockerRaw.name || lockerRaw.locker_name || '',
            address: lockerRaw.address || '',
            city: lockerRaw.locality_name || lockerRaw.city || '',
            county: lockerRaw.county_name || lockerRaw.county || '',
            carrier_id: lockerRaw.carrier_id ?? null,
            carrier_name: lockerRaw.carrier_name || '',
            allows_drop_off: lockerRaw.allows_drop_off ?? null,
            is_active: lockerRaw.is_active !== false,
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({
          success: false,
          exists: false,
          error: 'VALIDATE_FAILED',
          message: err?.message || 'Failed to validate pickup locker'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
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
          message: quotingData.message || 'No shipping quotes available',
          errors: quotingData.errors || [],
          debug_info: quotingData.debug_info || null
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (action === 'create_order') {
      // Get user profile and order
      const [profileResult, orderResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', ownerId).single(),
        supabase.from('orders').select('*').eq('id', order_id).eq('user_id', ownerId).single()
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

      console.log('Creating AWB with API key present:', !!profile.eawb_api_key);
      console.log('Selected carrier:', selected_carrier, 'Selected service:', selected_service);

      // Enhanced address parsing with Romanian locality validation
      const parseAddress = (address: string, structuredFields?: any) => {
        // Romanian city-county validation mapping
        const validateRomanianLocality = (city: string): string => {
          const normalizedCity = city.toLowerCase().replace(/[șş]/g, 's').replace(/[țţ]/g, 't');
          
          // Major Romanian cities with correct spelling
          const cityMappings: { [key: string]: string } = {
            'bucuresti': 'București',
            'bucharest': 'București',
            'bucureşti': 'București',
            'bucuresci': 'București',
            'constanta': 'Constanța',
            'constanţa': 'Constanța',
            'cluj-napoca': 'Cluj-Napoca',
            'timisoara': 'Timișoara',
            'timişoara': 'Timișoara',
            'iasi': 'Iași',
            'iaşi': 'Iași',
            'brasov': 'Brașov',
            'braşov': 'Brașov',
            'craiova': 'Craiova',
            'galati': 'Galați',
            'galaţi': 'Galați',
            'ploiesti': 'Ploiești',
            'ploieşti': 'Ploiești',
            'oradea': 'Oradea',
            'braila': 'Brăila',
            'arad': 'Arad',
            'pitesti': 'Pitești',
            'piteşti': 'Pitești',
            'sibiu': 'Sibiu',
            'bacau': 'Bacău',
            'baia mare': 'Baia Mare',
            'buzau': 'Buzău',
            'satu mare': 'Satu Mare',
            'botosani': 'Botoșani',
            'botoşani': 'Botoșani'
          };

          return cityMappings[normalizedCity] || city.charAt(0).toUpperCase() + city.slice(1);
        };

        const validateRomanianCounty = (county: string): string => {
          const normalizedCounty = county.toLowerCase().replace(/[șş]/g, 's').replace(/[țţ]/g, 't');
          
          // Romanian county mappings  
          const countyMappings: { [key: string]: string } = {
            'bucuresti': 'București',
            'bucharest': 'București',
            'bucureşti': 'București', 
            'ilfov': 'Ilfov',
            'constanta': 'Constanța',
            'constanţa': 'Constanța',
            'cluj': 'Cluj',
            'timis': 'Timiș',
            'timiş': 'Timiș',
            'iasi': 'Iași',
            'iaşi': 'Iași',
            'brasov': 'Brașov',
            'braşov': 'Brașov',
            'dolj': 'Dolj',
            'galati': 'Galați',
            'galaţi': 'Galați',
            'prahova': 'Prahova',
            'bihor': 'Bihor',
            'braila': 'Brăila',
            'arad': 'Arad',
            'arges': 'Argeș',
            'argeş': 'Argeș',
            'sibiu': 'Sibiu',
            'bacau': 'Bacău',
            'maramures': 'Maramureș',
            'maramureş': 'Maramureș',
            'buzau': 'Buzău',
            'satu mare': 'Satu Mare',
            'botosani': 'Botoșani',
            'botoşani': 'Botoșani'
          };

          return countyMappings[normalizedCounty] || county.charAt(0).toUpperCase() + county.slice(1);
        };

        // If structured fields are available, use them directly
        if (structuredFields?.customer_city && structuredFields?.customer_street && structuredFields?.customer_street_number) {
          return {
            city: validateRomanianLocality(structuredFields.customer_city),
            county: validateRomanianCounty(structuredFields.customer_county || structuredFields.customer_city),
            street: `${structuredFields.customer_street} ${structuredFields.customer_street_number}`,
            postal_code: address.match(/\b\d{6}\b/)?.[0] || ''
          };
        }

        // Improved Romanian address parsing
        const cleaned = address
          .replace(/,?\s*(ap\.?\s*\d+|apartament\s*\d+|etaj\s*\d+|et\.?\s*\d+)/gi, '')
          .replace(/,?\s*(bl\.?\s*[A-Z0-9]+|bloc\s+[A-Z0-9]+)/gi, '')
          .trim();

        const parts = cleaned.split(/[,;]/).map(p => p.trim()).filter(Boolean);
        
        // Handle Bucharest specifically
        if (/bucure[sș]ti|sector\s*[1-6]/gi.test(address)) {
          let street = '';
          // Extract street from remaining parts after removing Bucharest
          for (const part of parts) {
            if (!/bucure[sș]ti|sector\s*[1-6]/gi.test(part) && part.length > 3) {
              street = part;
              break;
            }
          }
          return {
            city: 'București',
            county: 'București',
            street: street || parts[parts.length - 1] || 'Strada Principala',
            postal_code: address.match(/\b\d{6}\b/)?.[0] || ''
          };
        }

        // Standard parsing for other Romanian cities
        let city = 'București'; // Safe fallback
        let county = 'București';
        let street = '';

        if (parts.length >= 3) {
          city = parts[0];
          street = parts[1];
          county = parts[2].replace(/^(jud\.?\s*|judetul\s*)/i, '');
        } else if (parts.length === 2) {
          city = parts[0];
          street = parts[1];
          county = parts[0];
        } else if (parts.length === 1) {
          // Try to extract city and street from single part
          const singlePart = parts[0];
          const cityMatch = singlePart.match(/^([^,]+?)\s+(str\.|strada|bd\.|bulevardul|calea|piata)/i);
          if (cityMatch) {
            city = cityMatch[1];
            street = singlePart.substring(cityMatch[1].length).trim();
          } else {
            street = singlePart;
          }
          county = city;
        }

        return {
          city: validateRomanianLocality(city),
          county: validateRomanianCounty(county),
          street,
          postal_code: address.match(/\b\d{6}\b/)?.[0] || ''
        };
      };

      const extractStreetInfo = (streetAddress: string, structuredFields?: any) => {
        // If structured fields are available, use them directly
        if (structuredFields?.customer_street && structuredFields?.customer_street_number) {
          return {
            street_name: structuredFields.customer_street,
            street_number: structuredFields.customer_street_number
          };
        }

        // Enhanced street parsing for Romanian addresses
        let streetName = 'Strada';
        let streetNumber = '1';
        
        // Remove common prefixes and clean the string
        const cleaned = streetAddress.replace(/^(str\.|strada|bd\.|bulevardul|calea|piata)\s*/i, '').trim();
        
        // Try to extract street name and number using various patterns
        const patterns = [
          /^(.+?)\s+nr\.?\s*(\d+)/i,  // "Ion Maiorescu nr 15"
          /^(.+?)\s+(\d+)$/,           // "Ion Maiorescu 15"
          /^(.+?),?\s*(\d+)/           // "Ion Maiorescu, 15"
        ];
        
        for (const pattern of patterns) {
          const match = cleaned.match(pattern);
          if (match) {
            streetName = match[1].trim();
            streetNumber = match[2];
            break;
          }
        }
        
        // If no number found, use the whole string as street name
        if (streetNumber === '1' && cleaned && !patterns.some(p => p.test(cleaned))) {
          streetName = cleaned;
        }

        return {
          street_name: streetName || 'Strada',
          street_number: streetNumber || '1'
        };
      };

      // Use structured sender fields when available, fallback to parsing
      const senderParsed = profile.eawb_city && profile.eawb_county ? {
        city: profile.eawb_city,
        county: profile.eawb_county,
        street: profile.eawb_street || '',
        postal_code: ''
      } : parseAddress(profile.eawb_address || 'București, România');
      
      // For recipient, prioritize structured fields
      const isBadCounty = (v: string | null | undefined) => {
        if (!v) return true;
        const n = String(v).toLowerCase().trim();
        return n === 'romania' || n === 'românia' || n === 'ro' || n.length < 2;
      };
      const fallbackParsed = parseAddress(order.customer_address, order);
      const recipientParsed = address_override ? {
        city: address_override.city || (order.customer_city || parseAddress(order.customer_address, order).city),
        county: address_override.county || (isBadCounty(order.customer_county) ? fallbackParsed.county : order.customer_county),
        street: order.customer_street ? `${order.customer_street} ${order.customer_street_number || ''}`.trim() : parseAddress(order.customer_address, order).street,
        postal_code: address_override.postal_code || parseAddress(order.customer_address, order).postal_code
      } : {
        city: order.customer_city || parseAddress(order.customer_address, order).city,
        county: isBadCounty(order.customer_county) ? fallbackParsed.county : order.customer_county,
        street: order.customer_street ? `${order.customer_street} ${order.customer_street_number || ''}`.trim() : parseAddress(order.customer_address, order).street,
        postal_code: parseAddress(order.customer_address, order).postal_code
      };

      console.log('Addresses:', { sender: senderParsed, recipient: recipientParsed });

      const senderStreet = profile.eawb_street && profile.eawb_street_number ? {
        street_name: profile.eawb_street,
        street_number: profile.eawb_street_number
      } : extractStreetInfo(profile.eawb_address || '');
      
      const recipientStreet = order.customer_street && order.customer_street_number ? {
        street_name: order.customer_street,
        street_number: order.customer_street_number
      } : extractStreetInfo(order.customer_address, order);

      // Extract locker street info from locker_address if available
      const lockerStreet = order.locker_address
        ? extractStreetInfo(order.locker_address)
        : { street_name: 'Locker', street_number: '1' };

      // Determine if this is locker delivery
      const isLockerDelivery = order.delivery_type === 'locker' && order.locker_id;
      const isLockerService = Number(selected_service) === 2 || Number(selected_service) === 4; // HOME_TO_LOCKER or LOCKER_TO_LOCKER

      console.log('Delivery info:', { 
        delivery_type: order.delivery_type, 
        locker_id: order.locker_id,
        selected_service,
        isLockerDelivery,
        isLockerService
      });

      // Build address_to based on delivery type
      let addressTo: any;
      if (isLockerDelivery && isLockerService) {
        // For locker delivery, use fixed_location_id with locality info and street placeholders
        const lockerLocality =
          order.customer_city ||
          recipientParsed.city ||
          '';
        const lockerCounty =
          (!isBadCounty(order.customer_county) ? order.customer_county : null) ||
          recipientParsed.county ||
          '';
        addressTo = {
          country_code: 'RO',
          fixed_location_id: Number(order.locker_id),
          locality_name: lockerLocality,
          county_name: lockerCounty,
          street_name: lockerStreet.street_name || 'Locker',
          street_number: lockerStreet.street_number || '1',
          contact: order.customer_name,
          phone: order.customer_phone || '0700000000',
          email: order.customer_email
        };
        console.log('Using locker address:', addressTo);
      } else {
        // For home delivery, use regular structured address
        addressTo = {
          country_code: 'RO',
          county_name: recipientParsed.county,
          locality_name: recipientParsed.city,
          postal_code: recipientParsed.postal_code || undefined,
          contact: order.customer_name,
          street_name: recipientStreet.street_name,
          street_number: recipientStreet.street_number,
          phone: order.customer_phone || '0700000000',
          email: order.customer_email
        };
        console.log('Using home address:', addressTo);
      }

      // Prefer merchant default pickup locker for locker-from services (3 & 4).
      // Otherwise keep existing Pickup Address / structured address logic.
      const serviceIdNum = Number(selected_service);
      const needsPickupLocker = serviceIdNum === 3 || serviceIdNum === 4;
      const savedPickupLockerId = profile.eawb_pickup_locker_id
        ? Number(profile.eawb_pickup_locker_id)
        : null;
      const lockerCarrierMatches =
        !profile.eawb_pickup_locker_carrier_id ||
        !selected_carrier ||
        Number(profile.eawb_pickup_locker_carrier_id) === Number(selected_carrier);

      const shippingAddressId: number | null = profile.eawb_shipping_address_id ?? null;

      let addressFrom: any;
      if (needsPickupLocker && savedPickupLockerId && lockerCarrierMatches) {
        const lockerStreet = profile.eawb_pickup_locker_address
          ? extractStreetInfo(profile.eawb_pickup_locker_address)
          : { street_name: 'Locker', street_number: '1' };
        addressFrom = {
          country_code: 'RO',
          fixed_location_id: savedPickupLockerId,
          locality_name: profile.eawb_pickup_locker_city || senderParsed.city || '',
          county_name: profile.eawb_pickup_locker_county || senderParsed.county || '',
          street_name: lockerStreet.street_name || 'Locker',
          street_number: lockerStreet.street_number || '1',
          contact: profile.eawb_name || profile.store_name || 'Sender',
          phone: profile.eawb_phone || '0700000000',
          email: profile.eawb_email || user.email
        };
        console.log('Using default pickup locker for address_from:', addressFrom);
      } else {
        addressFrom = shippingAddressId
          ? { address_from_id: shippingAddressId }
          : {
              country_code: 'RO',
              county_name: senderParsed.county,
              locality_name: senderParsed.city,
              postal_code: senderParsed.postal_code || undefined,
              contact: profile.eawb_name || profile.store_name || 'Sender',
              street_name: senderStreet.street_name,
              street_number: senderStreet.street_number,
              phone: profile.eawb_phone || '0700000000',
              email: profile.eawb_email || user.email
            };
        console.log('Using address_from (pickup address):', addressFrom);
      }

      // Resolve billing address automatically (never ask the user for an internal ID)
      let billingAddressId: number | null = profile.eawb_billing_address_id ?? null;
      let billingAddressRow: any = null;
      if (!billingAddressId) {
        console.log('No stored billing_address_id, fetching from eAWB...');
        const bResp = await fetch(`${EAWB_BASE_URL}/addresses/billing?all=true`, {
          method: 'GET',
          headers: {
            'X-API-Key': profile.eawb_api_key,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        const bText = await bResp.text();
        console.log('Billing lookup status:', bResp.status, 'body:', bText);
        let bJson: any = null;
        try { bJson = JSON.parse(bText); } catch (_e) { /* ignore */ }
        const bList = Array.isArray(bJson?.list)
          ? bJson.list
          : (Array.isArray(bJson?.data?.list) ? bJson.data.list : (Array.isArray(bJson?.data) ? bJson.data : []));
        const pick = bList.length === 1 ? bList[0] : bList.find((a: any) => a.is_default);
        if (pick?.id) {
          billingAddressId = Number(pick.id);
          billingAddressRow = pick;
          await supabase
            .from('profiles')
            .update({ eawb_billing_address_id: billingAddressId })
            .eq('user_id', ownerId);
          console.log('Auto-resolved billing_address_id:', billingAddressId);
        } else if (bList.length > 1) {
          return new Response(JSON.stringify({
            success: false,
            error: 'MULTIPLE_BILLING_ADDRESSES',
            message: 'Multiple billing addresses found. Please select one in Store Settings → Integrations → eAWB.',
            billing_addresses: bList
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else {
          return new Response(JSON.stringify({
            success: false,
            error: 'NO_BILLING_ADDRESS',
            message: 'No billing address found in your Europarcel/eAWB account. Please create one in your Europarcel dashboard.'
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // Cash on Delivery / pay-at-locker → official eAWB bank_repayment_* fields
      // (NOT the non-documented "cod_amount" key previously used)
      const isCod =
        String(order.payment_status || '').toLowerCase() === 'cash' ||
        String(order.payment_method || '').toLowerCase() === 'cash';
      const manualCodAmount = Number(package_details?.cod_amount || 0);
      const codAmount = isCod
        ? Number(order.total || 0)
        : (manualCodAmount > 0 ? manualCodAmount : 0);
      const needsCod = codAmount > 0;

      let bankIban: string | null = null;
      let bankHolder: string | null = null;

      if (needsCod) {
        // Prefer Europarcel account profile IBAN (official CustomerProfile.bank_iban)
        try {
          const profileResp = await fetch(`${EAWB_BASE_URL}/account/profile`, {
            method: 'GET',
            headers: {
              'X-API-Key': profile.eawb_api_key,
              'Accept': 'application/json'
            }
          });
          const profileJson = await profileResp.json();
          const acct = profileJson?.data || profileJson;
          bankIban = acct?.bank_iban || null;
          bankHolder = acct?.bank_holder || acct?.name || null;
          console.log('Account profile IBAN present:', !!bankIban);
        } catch (e) {
          console.warn('Failed to fetch account profile for IBAN', e);
        }

        // Fallback: billing address IBAN
        if (!bankIban) {
          try {
            if (!billingAddressRow && billingAddressId) {
              const bResp = await fetch(`${EAWB_BASE_URL}/addresses/billing?all=true`, {
                method: 'GET',
                headers: {
                  'X-API-Key': profile.eawb_api_key,
                  'Accept': 'application/json'
                }
              });
              const bJson = await bResp.json();
              const bList = Array.isArray(bJson?.list)
                ? bJson.list
                : (Array.isArray(bJson?.data?.list) ? bJson.data.list : (Array.isArray(bJson?.data) ? bJson.data : []));
              billingAddressRow = bList.find((a: any) => Number(a.id) === Number(billingAddressId)) || bList[0];
            }
            bankIban = billingAddressRow?.bank_iban || null;
            bankHolder = bankHolder || billingAddressRow?.bank_holder || billingAddressRow?.company || billingAddressRow?.contact || null;
          } catch (e) {
            console.warn('Failed to resolve billing IBAN', e);
          }
        }

        if (!codAmount || codAmount <= 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'COD_AMOUNT_INVALID',
            message: 'Cash on Delivery amount is missing or zero. Fix the order total (or COD amount) before generating an AWB.'
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (!bankIban || String(bankIban).trim().length < 15) {
          return new Response(JSON.stringify({
            success: false,
            error: 'COD_IBAN_MISSING',
            message: 'Cash on Delivery requires a bank IBAN on your Europarcel account (or billing address). Add bank_iban in your Europarcel dashboard, then try again. Without it the parcel would be shipped without collection.'
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      const extraPayload: Record<string, unknown> = {
        parcel_content: package_details.contents || 'Goods',
        declared_value: package_details.declared_value || order.total,
        internal_identifier: String(order.id).slice(0, 100),
      };

      if (needsCod && bankIban) {
        extraPayload.bank_repayment_amount = Number(codAmount.toFixed(2));
        extraPayload.bank_repayment_currency = 'RON';
        extraPayload.bank_iban = String(bankIban).trim();
        if (bankHolder && String(bankHolder).trim().length >= 5) {
          extraPayload.bank_holder = String(bankHolder).trim().slice(0, 70);
        }
      }

      // Build AWB request with nested content structure (matching quoting format)
      const awbRequest = {
        billing_to: { 
          billing_address_id: billingAddressId 
        },
        address_from: addressFrom,
        address_to: addressTo,
        content: {
          parcels_count: 1,
          pallets_count: 0,
          envelopes_count: 0,
          total_weight: package_details.weight || 1,
          total_weight_kg: package_details.weight || 1,
          parcels: [{
            sequence_no: 1,
            size: {
              weight: package_details.weight || 1,
              length: package_details.length || 30,
              width: package_details.width || 20,
              height: package_details.height || 10
            }
          }]
        },
        extra: extraPayload,
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

      console.log('Creating AWB with request:', JSON.stringify({
        ...awbRequest,
        extra: {
          ...extraPayload,
          bank_iban: bankIban ? '[REDACTED]' : undefined
        }
      }, null, 2));

      // Create AWB using the correct orders endpoint
      const response = await fetch(`${EAWB_BASE_URL}/orders`, {
        method: 'POST',
        headers: {
          'X-API-Key': profile.eawb_api_key,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(awbRequest)
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        console.error('AWB API returned non-JSON response. Status:', response.status, 'Body (first 500):', responseText.slice(0, 500));
        return new Response(JSON.stringify({
          success: false,
          error: 'EAWB_API_ERROR',
          message: `eAWB API returned status ${response.status} with non-JSON response. Check API key and endpoint.`,
          status: response.status,
          preview: responseText.slice(0, 300)
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.log('AWB creation response:', responseData);

      if (response.ok && responseData.data && responseData.data.awb_number) {
        const awbData = responseData.data;

        // Extract locker deposit / drop-off code only from official response fields
        const depositCode = (() => {
          const keys = [
            'locker_deposit_code', 'deposit_code', 'drop_off_code', 'dropoff_code',
            'handover_code', 'shipment_code', 'parcel_code', 'locker_pin', 'pin_code',
            'pin', 'easybox_code', 'client_code', 'pickup_code', 'locker_code',
            'parcel_pin', 'drop_code'
          ];
          const bags = [awbData, awbData.extra].filter(Boolean);
          for (const bag of bags) {
            if (typeof bag !== 'object') continue;
            for (const key of keys) {
              const v = (bag as any)[key];
              if (v != null && String(v).trim()) return String(v).trim();
            }
          }
          return null;
        })();

        // Secure label PDF link (GET /orders/label-link/{awb})
        let labelUrl: string | null = null;
        try {
          const labelResp = await fetch(
            `${EAWB_BASE_URL}/orders/label-link/${encodeURIComponent(String(awbData.awb_number))}`,
            {
              method: 'GET',
              headers: {
                'X-API-Key': profile.eawb_api_key,
                'Accept': 'application/json'
              }
            }
          );
          const labelJson = await labelResp.json();
          labelUrl = labelJson?.download_url || labelJson?.data?.download_url || null;
        } catch (e) {
          console.warn('Failed to fetch AWB label link', e);
        }

        const shippingCost =
          awbData.price?.total ??
          awbData.price?.amount ??
          null;
        
        // Update order with AWB details
        const updateData: any = {
          awb_number: awbData.awb_number,
          shipping_status: 'shipped',
          eawb_order_id: awbData.order_id,
          awb_service_name: awbData.service_name || null,
          awb_service_id: awbData.service_id != null ? Number(awbData.service_id) : Number(selected_service) || null,
          awb_carrier_id: awbData.carrier_id != null ? Number(awbData.carrier_id) : Number(selected_carrier) || null,
          awb_shipping_cost: shippingCost != null ? Number(shippingCost) : null,
          awb_cod_amount: needsCod ? Number(codAmount.toFixed(2)) : null,
          locker_deposit_code: depositCode,
          awb_response_extra: awbData.extra && typeof awbData.extra === 'object' ? awbData.extra : null,
        };

        if (labelUrl) {
          updateData.awb_label_url = labelUrl;
        }

        if (awbData.track_url) {
          updateData.tracking_url = awbData.track_url;
        }

        if (awbData.carrier) {
          updateData.carrier_name = awbData.carrier;
        }

        const estimatedDeliveryDate = toIsoDate(awbData.estimated_delivery_date);
        if (estimatedDeliveryDate) {
          updateData.estimated_delivery_date = estimatedDeliveryDate;
        }

        let { error: updateError } = await supabase
          .from('orders')
          .update(updateData)
          .eq('id', order_id)
          .eq('user_id', ownerId);

        if (updateError && updateData.estimated_delivery_date) {
          console.error('Order update error, retrying without delivery date:', updateError);
          const { estimated_delivery_date: _ignored, ...withoutDate } = updateData;
          const retry = await supabase
            .from('orders')
            .update(withoutDate)
            .eq('id', order_id)
            .eq('user_id', ownerId);
          updateError = retry.error;
        }

        if (updateError) {
          console.error('Order update error:', updateError);
          // Don't fail the entire request for update errors
        }

        return new Response(JSON.stringify({
          success: true,
          awb_number: awbData.awb_number,
          tracking_url: awbData.track_url,
          estimated_delivery_date: estimatedDeliveryDate || awbData.estimated_delivery_date,
          carrier_name: awbData.carrier,
          service_name: awbData.service_name || null,
          label_url: labelUrl,
          locker_deposit_code: depositCode,
          cod_amount: needsCod ? Number(codAmount.toFixed(2)) : null,
          shipping_cost: shippingCost != null ? Number(shippingCost) : null,
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

    // Cancel an existing Europarcel order / AWB
    if (action === 'cancel_order') {
      if (!order_id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_ORDER_ID',
          message: 'Order ID is required to cancel an AWB'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const [profileResult, orderResult] = await Promise.all([
        supabase.from('profiles').select('eawb_api_key').eq('user_id', ownerId).single(),
        supabase.from('orders').select('*').eq('id', order_id).eq('user_id', ownerId).single()
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

      if (!order.eawb_order_id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_EAWB_ORDER_ID',
          message: 'This order has no Europarcel order ID, so the AWB cannot be cancelled via the API.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (order.shipping_status === 'cancelled') {
        return new Response(JSON.stringify({
          success: true,
          message: 'AWB is already cancelled',
          order_id: order.eawb_order_id
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('Cancelling Europarcel order:', order.eawb_order_id, 'for store order:', order_id);

      const cancelResponse = await fetch(`${EAWB_BASE_URL}/orders/${order.eawb_order_id}`, {
        method: 'DELETE',
        headers: {
          'X-API-Key': profile.eawb_api_key,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      const cancelText = await cancelResponse.text();
      console.log('Cancel response status:', cancelResponse.status, 'body:', cancelText);

      let cancelData: any = null;
      try {
        cancelData = JSON.parse(cancelText);
      } catch (_e) {
        return new Response(JSON.stringify({
          success: false,
          error: 'EAWB_API_ERROR',
          message: `eAWB returned a non-JSON response (status ${cancelResponse.status})`,
          details: cancelText.slice(0, 300)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!cancelResponse.ok || cancelData?.success === false) {
        return new Response(JSON.stringify({
          success: false,
          error: cancelData?.error || 'CANCEL_FAILED',
          message: cancelData?.message || 'Failed to cancel AWB with Europarcel',
          details: cancelData
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update({ shipping_status: 'cancelled' })
        .eq('id', order_id)
        .eq('user_id', ownerId);

      if (updateError) {
        console.error('Order status update error after cancel:', updateError);
      }

      return new Response(JSON.stringify({
        success: true,
        order_id: cancelData?.order_id ?? order.eawb_order_id,
        message: cancelData?.message || 'AWB cancelled successfully'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get_label_link') {
      const awbNumber = body.awb_number || body.awb;
      const targetOrderId = order_id;

      const { data: profile } = await supabase
        .from('profiles')
        .select('eawb_api_key')
        .eq('user_id', ownerId)
        .single();

      if (!profile?.eawb_api_key) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_API_KEY',
          message: 'eAWB API key not configured'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let awb = awbNumber ? String(awbNumber) : '';
      if (!awb && targetOrderId) {
        const { data: ord } = await supabase
          .from('orders')
          .select('awb_number, awb_label_url')
          .eq('id', targetOrderId)
          .eq('user_id', ownerId)
          .single();
        if (ord?.awb_label_url && !body.refresh) {
          return new Response(JSON.stringify({
            success: true,
            download_url: ord.awb_label_url,
            awb: ord.awb_number,
            cached: true
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        awb = ord?.awb_number || '';
      }

      if (!awb) {
        return new Response(JSON.stringify({
          success: false,
          error: 'MISSING_AWB',
          message: 'AWB number is required to generate a label link'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const labelResp = await fetch(
        `${EAWB_BASE_URL}/orders/label-link/${encodeURIComponent(awb)}`,
        {
          method: 'GET',
          headers: {
            'X-API-Key': profile.eawb_api_key,
            'Accept': 'application/json'
          }
        }
      );
      const labelJson = await labelResp.json();
      if (!labelResp.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: 'LABEL_LINK_FAILED',
          message: labelJson?.message || 'Failed to generate AWB label link',
          details: labelJson
        }), {
          status: labelResp.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const downloadUrl = labelJson?.download_url || labelJson?.data?.download_url || null;
      if (downloadUrl && targetOrderId) {
        await supabase
          .from('orders')
          .update({ awb_label_url: downloadUrl })
          .eq('id', targetOrderId)
          .eq('user_id', ownerId);
      }

      return new Response(JSON.stringify({
        success: true,
        download_url: downloadUrl,
        awb: labelJson?.awb || awb,
        format: labelJson?.format || labelJson?.data?.format || 'pdf'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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