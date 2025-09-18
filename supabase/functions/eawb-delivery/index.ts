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

    const { action, order_id, package_details, selected_carrier, selected_service, address_override } = requestBody;
    console.log('Action received:', action)
    console.log('Request body:', { action, order_id, package_details, selected_carrier, selected_service, address_override })

    // Get authenticated user
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // Romanian diacritics mapping
    const addDiacriticsRO = (text: string) => {
      const repl: Record<string, string> = {
        'Bucuresti': 'București',
        'Ploiesti': 'Ploiești',
        'Pitesti': 'Pitești',
        'Iasi': 'Iași',
        'Bistrita': 'Bistrița',
        'Buzau': 'Buzău',
        'Brasov': 'Brașov',
        'Piatra Neamt': 'Piatra Neamț',
        'Targu Mures': 'Târgu Mureș',
        'Targu Jiu': 'Târgu Jiu',
        'Targoviste': 'Târgoviște',
        'Timisoara': 'Timișoara',
        'Constanta': 'Constanța',
        'Craiova': 'Craiova',
        'Galati': 'Galați',
        'Cluj-Napoca': 'Cluj-Napoca',
        'Oradea': 'Oradea',
      };
      let out = text;
      for (const [k, v] of Object.entries(repl)) {
        const re = new RegExp(k, 'gi');
        out = out.replace(re, v);
      }
      return out;
    };

    // Enhanced Romanian address parsing
    const parseRomanianAddress = (address: string) => {
      console.log('Parsing address:', address);
      
      // Remove apartment/floor info that causes parsing issues
      let cleanAddress = address
        .replace(/,?\s*(ap\.?\s*\d+|apart\.?\s*\d+|et\.?\s*\d+|sc\.?\s*[A-Z])/gi, '')
        .replace(/,?\s*(bl\.?\s*[A-Z0-9]+|bloc\s+[A-Z0-9]+)/gi, '')
        .trim();

      console.log('Cleaned address:', cleanAddress);

      const parts = cleanAddress.split(',').map(p => p.trim()).filter(Boolean);
      console.log('Address parts:', parts);
      
      // Handle Bucharest sectors specifically  
      const isBucharest = /bucure[sș]ti|sector\s*[1-6]/gi.test(address);
      if (isBucharest) {
        const sectorMatch = address.match(/sector\s*([1-6])/gi);
        const result = {
          city: 'București',
          county: 'București',
          sector: sectorMatch ? sectorMatch[0] : null,
          street: parts[0] || '',
          cleanAddress: `București, România`
        };
        console.log('Bucharest result:', result);
        return result;
      }

      // Standard Romanian address parsing
      // Find the city - look for known Romanian cities or the part before "Romania"
      let street = '', city = '', county = '';
      
      // Look for Romania and use the part before it as city
      const romaniaIndex = parts.findIndex(part => /romania|român[aă]/gi.test(part));
      if (romaniaIndex > 0) {
        city = parts[romaniaIndex - 1];
        street = parts.slice(0, romaniaIndex - 1).join(', ');
      } else if (parts.length >= 2) {
        // Standard parsing: take the last meaningful part as city
        city = parts[parts.length - 1];
        street = parts.slice(0, -1).join(', ');
      } else {
        street = parts[0] || '';
        city = 'București'; // fallback
      }

      // Try to guess county from known city-county mappings
      const cityCountyMap: Record<string, string> = {
        'București': 'București',
        'Bucharest': 'București',
        'Cluj-Napoca': 'Cluj',
        'Timișoara': 'Timiș',
        'Constanța': 'Constanța',
        'Iași': 'Iași',
        'Brașov': 'Brașov',
        'Galați': 'Galați',
        'Craiova': 'Dolj',
        'Ploiești': 'Prahova',
        'Oradea': 'Bihor'
      };
      county = cityCountyMap[city] || city;

      const result = { street, city, county, cleanAddress: `${city}, ${county}` };
      console.log('Parsed result:', result);
      return result;
    };

    // Multi-approach locality resolution with fallbacks
    const resolveLocality = async (apiKey: string, countryCode: string, address: string) => {
      const apis = [
        'https://api.europarcel.com/api/public/localities',
        'https://api.europarcel.com/api/v1/localities',
        'https://api.europarcel.com/localities'
      ];

      const tryPostRequest = async (url: string, searchText: string) => {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'X-API-Key': apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ country_code: countryCode, search_text: searchText })
          });
          
          if (!response.ok) {
            console.log(`POST ${url} failed:`, response.status);
            return null;
          }
          
          const data = await response.json();
          if (data?.success && Array.isArray(data?.data) && data.data.length > 0) {
            console.log(`✓ POST ${url} succeeded for "${searchText}"`);
            return data.data[0];
          }
          return null;
        } catch (error) {
          console.log(`POST ${url} error:`, error.message);
          return null;
        }
      };

      const tryGetRequest = async (url: string, searchText: string) => {
        try {
          const response = await fetch(`${url}?country_code=${countryCode}&search_text=${encodeURIComponent(searchText)}`, {
            method: 'GET',
            headers: {
              'X-API-Key': apiKey,
              'Content-Type': 'application/json',
            }
          });
          
          if (!response.ok) {
            console.log(`GET ${url} failed:`, response.status);
            return null;
          }
          
          const data = await response.json();
          if (data?.success && Array.isArray(data?.data) && data.data.length > 0) {
            console.log(`✓ GET ${url} succeeded for "${searchText}"`);
            return data.data[0];
          }
          return null;
        } catch (error) {
          console.log(`GET ${url} error:`, error.message);
          return null;
        }
      };

      const parseResult = parseRomanianAddress(address);
      const searchTerms = [
        address, // original
        parseResult.cleanAddress, // cleaned
        addDiacriticsRO(address), // with diacritics
        addDiacriticsRO(parseResult.cleanAddress), // clean + diacritics
        parseResult.city, // just city
        addDiacriticsRO(parseResult.city), // city with diacritics
        `${parseResult.city}, ${parseResult.county}`, // city, county
        addDiacriticsRO(`${parseResult.city}, ${parseResult.county}`) // city, county with diacritics
      ].filter((term, index, arr) => term && arr.indexOf(term) === index); // remove duplicates

      // Try all API endpoints with all search terms
      for (const url of apis) {
        for (const searchTerm of searchTerms) {
          // Try POST first
          let result = await tryPostRequest(url, searchTerm);
          if (result) return result;
          
          // Try GET as fallback
          result = await tryGetRequest(url, searchTerm);
          if (result) return result;
        }
      }

      console.warn(`Could not resolve locality for: "${address}"`);
      return null;
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
      const parsed = parseRomanianAddress(address);
      return { 
        city: parsed.city, 
        county: parsed.county,
        street: parsed.street,
        sector: parsed.sector || null
      };
    };
    // Extract Romanian postal code (6 digits)
    const extractPostalCode = (address: string): string | null => {
      const match = address.match(/\b\d{6}\b/);
      return match ? match[0] : null;
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

      // Enhanced address parsing with detailed logging
      console.log('=== ADDRESS PARSING DEBUG ===');
      console.log('Raw sender address:', profile.eawb_address);
      console.log('Raw recipient address:', order.customer_address);
      
      const senderParsed = extractCityCounty(profile.eawb_address || '')
      console.log('Parsed sender:', senderParsed);
      
      const recipientParsed = extractCityCounty(order.customer_address || '')
      console.log('Parsed recipient:', recipientParsed);
      console.log('==============================');

      // Resolve sender and recipient localities with enhanced robustness
      console.log(`Resolving sender locality for: "${profile.eawb_address}"`)
      let senderLocalityResult = await resolveLocality(profile.eawb_api_key, 'RO', profile.eawb_address || '')

      console.log(`Resolving recipient locality for: "${order.customer_address}"`)
      let recipientLocalityResult = await resolveLocality(profile.eawb_api_key, 'RO', order.customer_address || '')

      // Graceful fallback: some carriers (like GLS) work without strict locality_id
      const canUseWithoutLocalityId = (carrierCode: string) => {
        const flexibleCarriers = ['GLS', 'DPD', 'EXPRESS', 'SAMEDAY', 'CARGUS'];
        return flexibleCarriers.includes(carrierCode.toUpperCase());
      };

      const senderStreetInfo = extractStreetInfo(profile.eawb_address || '')
      const recipientStreetInfo = extractStreetInfo(order.customer_address || '')

      const senderPostal = extractPostalCode(profile.eawb_address || '') || undefined;
      let recipientPostal = extractPostalCode(order.customer_address || '') || undefined;
      const overrideCity = address_override?.city?.trim();
      const overrideCounty = address_override?.county?.trim();
      const overridePostal = address_override?.postal_code?.trim();
      if (overridePostal) recipientPostal = overridePostal;

      // Build address objects with fallback support
      const senderAddress = {
        country_code: 'RO',
        county_name: senderLocalityResult?.county_name || senderParsed.county || '',
        locality_name: senderLocalityResult?.locality_name || senderParsed.city || '',
        locality_id: senderLocalityResult?.locality_id || null, // null instead of failing
        postal_code: senderPostal,
        contact: profile.eawb_name || 'Sender',
        street_name: senderStreetInfo.street_name,
        street_number: senderStreetInfo.street_number,
        phone: profile.eawb_phone || '0700000000',
        email: profile.eawb_email || 'sender@example.com'
      }

      const recipientAddress = {
        country_code: 'RO', 
        county_name: overrideCounty || recipientLocalityResult?.county_name || recipientParsed.county || '',
        locality_name: overrideCity || recipientLocalityResult?.locality_name || recipientParsed.city || '',
        locality_id: recipientLocalityResult?.locality_id || null, // may be null when overridden
        postal_code: recipientPostal,
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
      const attempts: any[] = []
      
      for (const carrier of carriers) {
        // Calculate prices for all active carriers that have services
        if (!carrier.carrier_services || carrier.carrier_services.length === 0) {
          continue
        }

        for (const service of carrier.carrier_services) {
          // Skip carriers that require locality_id if we don't have it
          const needsLocalityId = !canUseWithoutLocalityId(carrier.code);
          const hasLocalityIds = senderAddress.locality_id && recipientAddress.locality_id;
          
          if (needsLocalityId && !hasLocalityIds) {
            console.log(`Skipping ${carrier.name} - ${service.name}: requires locality_id but not available`);
            attempts.push({
              carrier_id: carrier.id,
              carrier_name: carrier.name,
              service_id: parseInt(service.service_code),
              service_name: service.name,
              status: 'skipped',
              message: 'Requires locality_id but addresses could not be resolved',
              success: false
            });
            continue;
          }

          // Create price request with conditional locality_id
          const priceRequest = {
            billing_to: {
              billing_address_id: billingAddressId
            },
            address_from: {
              ...senderAddress,
              ...(senderAddress.locality_id ? {} : { locality_id: undefined })
            },
            address_to: {
              ...recipientAddress,
              ...(recipientAddress.locality_id ? {} : { locality_id: undefined })
            },
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

            attempts.push({
              carrier_id: carrier.id,
              carrier_name: carrier.name,
              service_id: parseInt(service.service_code),
              service_name: service.name,
              status: response.status,
              success: result?.success,
              message: result?.message,
              errors: result?.errors,
              data_len: Array.isArray(result?.data) ? result.data.length : null
            })

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
            attempts.push({
              carrier_id: carrier.id,
              carrier_name: carrier.name,
              service_id: parseInt(service.service_code),
              service_name: service.name,
              status: 'exception',
              error: String(error)
            })
          }
        }
      }

      if (allQuotes.length === 0) {
        // Provide detailed error information
        const hasLocalityIds = senderAddress.locality_id && recipientAddress.locality_id;
        const errorMessage = hasLocalityIds 
          ? 'No carrier returned a price for the provided addresses and parcels. This may be due to carrier-specific restrictions or invalid package details.'
          : 'Address locality IDs could not be resolved. Some carriers may require exact locality resolution for accurate pricing.';

        return new Response(JSON.stringify({
          success: false,
          error: 'NO_QUOTES',
          message: errorMessage,
          suggestions: hasLocalityIds 
            ? ['Check package dimensions and weight', 'Verify addresses are complete', 'Try different carriers']
            : ['Check address format', 'Ensure city and county are correct', 'Some addresses may not be in carrier databases'],
          details: {
            senderAddress: {
              ...senderAddress,
              locality_resolved: !!senderAddress.locality_id
            },
            recipientAddress: {
              ...recipientAddress,
              locality_resolved: !!recipientAddress.locality_id
            },
            billingAddressId,
            attempts
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

      // Create eAWB order using the selected carrier with enhanced address resolution
      console.log('=== CREATE ORDER ADDRESS PARSING ===');
      console.log('Raw sender address:', profile.eawb_address);
      console.log('Raw recipient address:', order.customer_address);
      
      const senderParsed = extractCityCounty(profile.eawb_address || '')
      const recipientParsed = extractCityCounty(order.customer_address || '') 
      
      const senderLoc = await resolveLocality(profile.eawb_api_key, 'RO', profile.eawb_address || '')
      const recipientLoc = await resolveLocality(profile.eawb_api_key, 'RO', order.customer_address || '')
      
      console.log('Sender locality result:', senderLoc);
      console.log('Recipient locality result:', recipientLoc);
      
      // Use fallback values if locality resolution failed
      const senderStreet = extractStreetInfo(profile.eawb_address || '')
      const recipientStreet = extractStreetInfo(order.customer_address || '')

      const senderPostal = extractPostalCode(profile.eawb_address || '') || undefined;
      let recipientPostal = extractPostalCode(order.customer_address || '') || undefined;
      const overrideCity = address_override?.city?.trim();
      const overrideCounty = address_override?.county?.trim();
      const overridePostal = address_override?.postal_code?.trim();
      if (overridePostal) recipientPostal = overridePostal;

      const senderAddress = {
        country_code: 'RO',
        county_name: senderLoc?.county_name || senderParsed.county || '',
        locality_name: senderLoc?.locality_name || senderParsed.city || '',
        locality_id: senderLoc?.locality_id || null,
        postal_code: senderPostal,
        contact: profile.eawb_name || 'Your Company',
        street_name: senderStreet.street_name,
        street_number: senderStreet.street_number,
        phone: profile.eawb_phone || '0700000000',
        email: profile.eawb_email || 'sender@example.com'
      };

      const recipientAddress = {
        country_code: 'RO',
        county_name: overrideCounty || recipientLoc?.county_name || recipientParsed.county || '',
        locality_name: overrideCity || recipientLoc?.locality_name || recipientParsed.city || '',
        locality_id: recipientLoc?.locality_id || null,
        postal_code: recipientPostal,
        contact: order.customer_name,
        street_name: recipientStreet.street_name,
        street_number: recipientStreet.street_number,
        phone: order.customer_phone || '0700000000',
        email: order.customer_email
      };

      // Only fail if we have neither locality_id nor basic city/county info
      if ((!senderAddress.locality_id && !senderAddress.locality_name) || 
          (!recipientAddress.locality_id && !recipientAddress.locality_name)) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'ADDRESS_VALIDATION_FAILED', 
            message: 'Could not resolve basic address information',
            details: { 
              senderAddress, 
              recipientAddress,
              parsing: { senderParsed, recipientParsed }
            } 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const eawbOrderData = {
        billing_to: profile.eawb_billing_address_id ? {
          billing_address_id: profile.eawb_billing_address_id
        } : undefined,
        address_from: senderAddress,
        address_to: recipientAddress,
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