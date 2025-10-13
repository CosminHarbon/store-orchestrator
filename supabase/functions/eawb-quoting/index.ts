import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EAWB_BASE_URL = 'https://api.europarcel.com/api/public';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== eAWB Quoting Service ===');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { order_id, package_details, address_override } = await req.json();
    console.log('Request:', { order_id, package_details, address_override });

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    // Fetch order and profile
    const [orderResult, profileResult] = await Promise.all([
      supabase.from('orders').select('*').eq('id', order_id).eq('user_id', user.id).single(),
      supabase.from('profiles').select('*').eq('user_id', user.id).single()
    ]);

    if (orderResult.error) {
      throw new Error('Order not found');
    }
    if (profileResult.error) {
      throw new Error('Profile not found');
    }

    const order = orderResult.data;
    const profile = profileResult.data;

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

    console.log('User profile loaded, eAWB key present:', !!profile.eawb_api_key);

    // Get active carriers and services from database
    const { data: dbCarriers } = await supabase
      .from('carriers')
      .select(`
        id, name, code, logo_url, is_active,
        carrier_services (id, name, service_code, description, is_active)
      `)
      .eq('is_active', true);

    if (!dbCarriers || dbCarriers.length === 0) {
      throw new Error('No active carriers found in database');
    }

    console.log(`Found ${dbCarriers.length} active carriers`);

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
    const recipientParsed = address_override ? {
      city: address_override.city || (order.customer_city || parseAddress(order.customer_address, order).city),
      county: address_override.county || (order.customer_county || parseAddress(order.customer_address, order).county),
      street: order.customer_street ? `${order.customer_street} ${order.customer_street_number || ''}`.trim() : parseAddress(order.customer_address, order).street,
      postal_code: address_override.postal_code || parseAddress(order.customer_address, order).postal_code
    } : {
      city: order.customer_city || parseAddress(order.customer_address, order).city,
      county: order.customer_county || parseAddress(order.customer_address, order).county,
      street: order.customer_street ? `${order.customer_street} ${order.customer_street_number || ''}`.trim() : parseAddress(order.customer_address, order).street,
      postal_code: parseAddress(order.customer_address, order).postal_code
    };

    console.log('Addresses parsed:', { sender: senderParsed, recipient: recipientParsed });

    const senderStreet = profile.eawb_street && profile.eawb_street_number ? {
      street_name: profile.eawb_street,
      street_number: profile.eawb_street_number
    } : extractStreetInfo(profile.eawb_address || '');
    
    const recipientStreet = order.customer_street && order.customer_street_number ? {
      street_name: order.customer_street,
      street_number: order.customer_street_number
    } : extractStreetInfo(order.customer_address, order);

    // Build quote requests for each carrier/service combination
    const quoteRequests = [];
    const billingAddressId = profile.eawb_billing_address_id || 1;

    const parcelsCount = Math.max(1, Number(package_details.parcels || 1));
    const totalWeightInput = Number(package_details.weight || 1);
    const unitWeight = totalWeightInput / parcelsCount;
    const lengthCm = Number(package_details.length || 30);
    const widthCm = Number(package_details.width || 20);
    const heightCm = Number(package_details.height || 10);
    // Normalize size to API format (S, M, L, XL)
    const inputSize = (package_details as any).size || (package_details as any).parcel_size;
     let parcelSize = 'S'; // Default to small
     if (inputSize) {
       const sizeUpper = inputSize.toString().toUpperCase();
       if (sizeUpper.includes('SMALL') || sizeUpper === 'S' || sizeUpper === '1') parcelSize = 'S';
       else if (sizeUpper.includes('MEDIUM') || sizeUpper === 'M' || sizeUpper === '2') parcelSize = 'M';
       else if (sizeUpper.includes('LARGE') || sizeUpper === 'L' || sizeUpper === '3') parcelSize = 'L';
       else if (sizeUpper.includes('XL') || sizeUpper === 'XL' || sizeUpper === '4') parcelSize = 'XL';
     } else {
       // Auto-determine size based on weight
       parcelSize = unitWeight <= 1 ? 'S' : unitWeight <= 5 ? 'M' : unitWeight <= 10 ? 'L' : 'XL';
     }
    
    // Map size string to numeric code expected by some carriers
    const sizeMap: Record<string, number> = { S: 1, M: 2, L: 3, XL: 4 };
    const sizeNum = sizeMap[parcelSize] ?? 1;

    const parcelsArray = Array.from({ length: parcelsCount }, (_, idx) => ({
      sequence_no: idx + 1,
      size: {
        weight: Number(unitWeight.toFixed(2)),
        length: lengthCm,
        width: widthCm,
        height: heightCm
      }
    }));
    // Calculate total weight from nested size objects
    const computedTotalWeight = Number(parcelsArray.reduce((s, p) => s + p.size.weight, 0).toFixed(2));

    const basePayload = {
      billing_to: { billing_address_id: billingAddressId },
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
      content: {
        parcels_count: parcelsArray.length,
        pallets_count: 0,
        envelopes_count: 0,
        total_weight: computedTotalWeight,
        total_weight_kg: computedTotalWeight,
        parcels: parcelsArray
      },
      extra: {
        parcel_content: package_details.contents || 'Goods',
        declared_value: Number(package_details.declared_value || order.total)
      },
      service: {
        currency: 'RON',
        payment_type: 1
      }
    };

    // Create quote requests for each carrier/service combination
    for (const carrier of dbCarriers) {
      if (!carrier.carrier_services || carrier.carrier_services.length === 0) {
        continue;
      }

      for (const service of carrier.carrier_services) {
        if (!service.is_active) continue;

        // Extract service ID from service_code or use a mapping
        let serviceId = 1; // Default to Home to Home
        if (service.service_code === 'HOME_TO_HOME') serviceId = 1;
        else if (service.service_code === 'HOME_TO_LOCKER') serviceId = 2;
        else if (service.service_code === 'LOCKER_TO_HOME') serviceId = 3;
        else if (service.service_code === 'LOCKER_TO_LOCKER') serviceId = 4;

        quoteRequests.push({
          mapping: {
            carrier_id: carrier.id,
            service_id: serviceId,
            carrier_name: carrier.name,
            service_name: service.name,
            logo_url: carrier.logo_url
          },
          payload: {
            ...basePayload,
            carrier_id: carrier.id,
            service_id: serviceId
          }
        });
      }
    }

    console.log(`Created ${quoteRequests.length} quote requests`);

    // Execute quote requests
    const quotes = [];
    const errors = [];

    for (const request of quoteRequests) {
      try {
        console.log(`Requesting quote for carrier ${request.mapping.carrier_id}, service ${request.mapping.service_id}`);
        
        console.log('Payload for', request.mapping.carrier_name, JSON.stringify(request.payload));
        const response = await fetch(`${EAWB_BASE_URL}/orders/prices`, {
          method: 'POST',
          headers: {
            'X-API-Key': profile.eawb_api_key,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(request.payload)
        });

        const responseData = await response.json();
        console.log(`Quote response for ${request.mapping.carrier_name}:`, responseData);

        if (
          response.ok &&
          Array.isArray(responseData.data) && responseData.data.length > 0
        ) {
          // Process each quote option
          for (const quote of responseData.data) {
            quotes.push({
              carrier_id: request.mapping.carrier_id,
              service_id: request.mapping.service_id,
              carrier_info: {
                name: request.mapping.carrier_name,
                logo_url: request.mapping.logo_url
              },
              service_info: {
                name: request.mapping.service_name
              },
              price: {
                total: quote.price?.total || quote.total_price || 0,
                currency: quote.price?.currency || quote.currency || 'RON'
              },
              estimated_pickup_date: quote.estimated_pickup_date,
              estimated_delivery_date: quote.estimated_delivery_date,
              raw_quote: quote
            });
          }
        } else {
          errors.push({
            carrier_id: request.mapping.carrier_id,
            service_id: request.mapping.service_id,
            carrier_name: request.mapping.carrier_name,
            error: responseData.message || (responseData.errors ? 'VALIDATION_ERROR' : 'No quotes available'),
            details: responseData.errors || null
          });
        }
      } catch (error: any) {
        console.error(`Quote request failed for ${request.mapping.carrier_name}:`, error);
        errors.push({
          carrier_id: request.mapping.carrier_id,
          service_id: request.mapping.service_id,
          carrier_name: request.mapping.carrier_name,
          error: error.message
        });
      }
    }

    console.log(`Generated ${quotes.length} quotes with ${errors.length} errors`);

    if (quotes.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'NO_QUOTES',
        message: 'No shipping quotes available',
        errors,
        debug_info: {
          requests_made: quoteRequests.length,
          carriers_tested: dbCarriers.length
        }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Sort quotes by price
    quotes.sort((a, b) => (a.price?.total || 0) - (b.price?.total || 0));

    return new Response(JSON.stringify({
      success: true,
      carrier_options: quotes,
      debug_info: {
        total_requests: quoteRequests.length,
        successful_quotes: quotes.length,
        errors: errors.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Quoting service error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});