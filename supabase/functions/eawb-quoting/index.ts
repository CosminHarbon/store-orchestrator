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
      console.error('Order fetch error:', orderResult.error);
      throw new Error('Order not found');
    }
    if (profileResult.error) {
      console.error('Profile fetch error:', profileResult.error);
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

    // Runtime base URL detection with fallbacks
    const detectBaseUrl = async (apiKey: string): Promise<string> => {
      const candidates = [
        // Direct API endpoints (most likely correct based on docs)
        'https://eawb.ro/api/direct',
        'https://eawb.ro/api/v1/direct',
        'https://api.eawb.ro/api/direct',
        'https://api.eawb.ro/direct',
        
        // Legacy endpoints as fallback
        'https://api.europarcel.com/api/public',
        'https://api.europarcel.com/api/v1',
        'https://eawb.ro/api/public',
        'https://eawb.ro/api/v1'
      ];

      for (const baseUrl of candidates) {
        try {
          console.log(`Testing base URL: ${baseUrl}`);
          const response = await fetch(`${baseUrl}/${baseUrl.includes('/direct') ? 'tables/carriers' : 'carriers'}`, {
            method: 'GET',
            headers: {
              'X-API-Key': apiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data && (Array.isArray(data) || Array.isArray(data.data))) {
              console.log(`✓ Base URL working: ${baseUrl}`);
              return baseUrl;
            }
          }
        } catch (error) {
          console.log(`✗ Base URL failed: ${baseUrl} - ${error.message}`);
        }
      }
      
      console.warn('No working base URL found, using default');
      return candidates[0]; // fallback to first option
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

    console.log('Addresses parsed:', { sender: senderParsed, recipient: recipientParsed });

    // Load eAWB catalog with robust error handling
    const loadCatalog = async () => {
      const headers = {
        'X-API-Key': profile.eawb_api_key,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      try {
        const [carriersRes, servicesRes] = await Promise.all([
          fetch(`${BASE_URL}/carriers`, { headers }),
          fetch(`${BASE_URL}/services`, { headers })
        ]);

        const carriersData = carriersRes.ok ? await carriersRes.json() : {};
        const servicesData = servicesRes.ok ? await servicesRes.json() : {};

        const carriers = Array.isArray(carriersData?.data) ? carriersData.data : 
                        Array.isArray(carriersData) ? carriersData : [];
        const services = Array.isArray(servicesData?.data) ? servicesData.data :
                        Array.isArray(servicesData) ? servicesData : [];

        console.log(`Catalog loaded: ${carriers.length} carriers, ${services.length} services`);
        return { carriers, services };
      } catch (error) {
        console.error('Catalog loading failed:', error);
        return { carriers: [], services: [] };
      }
    };

    const { carriers: eawbCarriers, services: eawbServices } = await loadCatalog();

    // Fallback mapping from docs: https://www.eawb.ro/docs/direct/tables/carriers
    const CARRIER_CODE_TO_ID: Record<string, number> = {
      cargus: 1,
      dpd: 2,
      fan_courier: 3,
      gls: 4,
      sameday: 6,
      bookurier: 16,
    };

    // Get DB carriers
    const { data: dbCarriers } = await supabase
      .from('carriers')
      .select(`
        id, name, code, logo_url, is_active,
        carrier_services (id, name, service_code, description, is_active)
      `)
      .eq('is_active', true);

    if (!dbCarriers || dbCarriers.length === 0) {
      console.warn('No carriers found in database; will try 0,0 (all carriers/services)');
    }

    console.log(`Found ${dbCarriers.length} DB carriers`);

    // Robust carrier mapping helpers (with static fallback by code)
    const mapCarrierOnly = (dbCarrier: any) => {
      // Prefer API catalog
      let eawbCarrier = eawbCarriers.find((c: any) => {
        const codeMatch = c.code?.toLowerCase() === dbCarrier.code?.toLowerCase();
        const nameMatch = c.name?.toLowerCase().includes(dbCarrier.name?.toLowerCase()) ||
                          dbCarrier.name?.toLowerCase().includes(c.name?.toLowerCase());
        return codeMatch || nameMatch;
      });

      if (!eawbCarrier) {
        const fallbackId = CARRIER_CODE_TO_ID[dbCarrier.code?.toLowerCase?.()] as number | undefined;
        if (fallbackId) {
          eawbCarrier = { id: fallbackId, name: dbCarrier.name, code: dbCarrier.code };
        }
      }

      if (!eawbCarrier) {
        console.warn(`No eAWB carrier found for: ${dbCarrier.name} (${dbCarrier.code})`);
        return null;
      }

      return {
        carrier_id: eawbCarrier.id,
        carrier_name: dbCarrier.name,
        logo_url: dbCarrier.logo_url,
      };
    };

    // Robust carrier+service mapping
    const mapCarrierService = (dbCarrier: any, dbService: any) => {
      const carrier = mapCarrierOnly(dbCarrier);
      if (!carrier) return null;

      // Try to parse service ID from service_code
      let serviceId = parseInt(dbService.service_code);

      // If not a number, try to find by name in catalog (if present)
      if (!Number.isFinite(serviceId) && Array.isArray(eawbServices) && eawbServices.length > 0) {
        const eawbService = eawbServices.find((s: any) => 
          s.carrier_id === carrier.carrier_id && (
            s.code?.toLowerCase() === dbService.service_code?.toLowerCase() ||
            s.name?.toLowerCase().includes(dbService.name?.toLowerCase())
          )
        );
        serviceId = eawbService?.id;
      }

      if (!Number.isFinite(serviceId)) {
        console.warn(`No valid service ID for: ${dbService.name} (${dbService.service_code})`);
        return null;
      }

      return {
        carrier_id: carrier.carrier_id,
        service_id: serviceId,
        carrier_name: dbCarrier.name,
        service_name: dbService.name,
        logo_url: dbCarrier.logo_url
      };
    };

    // Build quote requests
    const quoteRequests = [];
    const billingAddressId = profile.eawb_billing_address_id || 1;

    const senderStreet = extractStreetInfo(profile.eawb_address || '');
    const recipientStreet = extractStreetInfo(order.customer_address);

    // Add catch-all request: 0,0 => all carriers/services
    quoteRequests.push({
      mapping: { carrier_id: 0, carrier_name: 'All Carriers', logo_url: null, service_id: 0, service_name: 'All Services' },
      payload: {
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
        parcels: [{
          weight: package_details.weight || 1,
          length: package_details.length || 30,
          width: package_details.width || 20,
          height: package_details.height || 10,
          contents: package_details.contents || 'Goods',
          declared_value: package_details.declared_value || order.total
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
        carrier_id: 0,
        service_id: 0
      }
    });

    for (const carrier of dbCarriers) {
      if (!carrier.carrier_services?.length) {
        const mapped = mapCarrierOnly(carrier);
        if (mapped) {
          const request = {
            mapping: mapped,
            payload: {
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
              parcels: [{
                weight: package_details.weight || 1,
                length: package_details.length || 30,
                width: package_details.width || 20,
                height: package_details.height || 10,
                contents: package_details.contents || 'Goods',
                declared_value: package_details.declared_value || order.total
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
              carrier_id: mapped.carrier_id
            }
          };
          quoteRequests.push(request);
        }
        continue;
      }

      let serviceAdded = false;

      for (const service of carrier.carrier_services) {
        if (!service.is_active) continue;

        const mapping = mapCarrierService(carrier, service);
        if (!mapping) continue;

        const request = {
          mapping,
          payload: {
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
            parcels: [{
              weight: package_details.weight || 1,
              length: package_details.length || 30,
              width: package_details.width || 20,
              height: package_details.height || 10,
              contents: package_details.contents || 'Goods',
              declared_value: package_details.declared_value || order.total
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
            carrier_id: mapping.carrier_id,
            service_id: mapping.service_id
          }
        };

        quoteRequests.push(request);
        serviceAdded = true;
      }

      if (!serviceAdded) {
        const mapped = mapCarrierOnly(carrier);
        if (mapped) {
          const request = {
            mapping: mapped,
            payload: {
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
              parcels: [{
                weight: package_details.weight || 1,
                length: package_details.length || 30,
                width: package_details.width || 20,
                height: package_details.height || 10,
                contents: package_details.contents || 'Goods',
                declared_value: package_details.declared_value || order.total
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
              carrier_id: mapped.carrier_id
            }
          };
          quoteRequests.push(request);
        }
      }
    }

    console.log(`Built ${quoteRequests.length} quote requests`);

    // Concurrent quote requests with timeout; returns an array of quotes per request
    const fetchQuote = async (request: any, timeout = 12000): Promise<any[]> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const baseCandidates = [
        BASE_URL,
        // Direct API endpoints (most likely correct based on docs)
        'https://eawb.ro/api/direct',
        'https://eawb.ro/api/v1/direct',
        'https://api.eawb.ro/api/direct',
        'https://api.eawb.ro/direct',
        
        // Legacy endpoints as fallback
        'https://api.europarcel.com/api/public',
        'https://api.europarcel.com/api/v1',
        'https://eawb.ro/api/public',
        'https://eawb.ro/api/v1'
      ];

      const headerVariants = [
        (k: string) => ({ 'X-API-Key': k }),
        (k: string) => ({ 'X-Api-Key': k }),
        (k: string) => ({ 'apikey': k }),
        (k: string) => ({ 'Authorization': `Bearer ${k}` }),
        (k: string) => ({ 'Authorization': `ApiKey ${k}` }),
        (k: string) => ({ 'X-Auth-Token': k }),
      ];

      try {
        const requestLabel = `${request.mapping.carrier_name}${request.mapping.service_id ? ' - ' + request.mapping.service_id : ''}`;
        console.log(`Requesting quote(s): ${requestLabel}`);

        for (const base of baseCandidates) {
          for (const hv of headerVariants) {
            try {
              const response = await fetch(`${base}/calculate-prices`, {
                method: 'POST',
                headers: {
                  ...hv(profile.eawb_api_key),
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify(request.payload),
                signal: controller.signal
              });

              if (!response.ok) {
                console.warn(`Header attempt failed at ${base}: HTTP ${response.status}`);
                continue;
              }

              clearTimeout(timeoutId);

              const data = await response.json();
              if (data.success && Array.isArray(data.data) && data.data.length > 0) {
                const quotes = data.data.map((quote: any) => ({
                  carrier_info: {
                    id: request.mapping.carrier_id,
                    name: request.mapping.carrier_name,
                    logo_url: request.mapping.logo_url
                  },
                  service_info: {
                    id: quote.service_id || request.mapping.service_id,
                    name: quote.service_name || request.mapping.service_name || 'Service',
                    description: quote.service_description || ''
                  },
                  price: {
                    amount: parseFloat(quote.price?.amount || quote.price_amount || 0),
                    vat: parseFloat(quote.price?.vat || quote.price_vat || 0),
                    total: parseFloat(quote.price?.total || quote.price_total || 0),
                    currency: quote.price?.currency || quote.currency || 'RON'
                  },
                  estimated_pickup_date: quote.estimated_pickup_date || 'Next business day',
                  estimated_delivery_date: quote.estimated_delivery_date || '2-3 business days',
                  carrier_id: request.mapping.carrier_id,
                  service_id: quote.service_id || request.mapping.service_id
                }));

                console.log(`✓ Received ${quotes.length} quote(s) from ${base}`);
                return quotes;
              }
            } catch (innerErr: any) {
              console.warn(`Attempt failed for ${base}: ${innerErr.message}`);
              continue;
            }
          }
        }

        // If all attempts failed
        clearTimeout(timeoutId);
        return [];
      } catch (error: any) {
        clearTimeout(timeoutId);
        console.warn(`✗ Quote failed: ${request.mapping.carrier_name} - ${error.message}`);
        return [];
      }
    };

        const data = await response.json();
        
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          const quotes = data.data.map((quote: any) => ({
            carrier_info: {
              id: request.mapping.carrier_id,
              name: request.mapping.carrier_name,
              logo_url: request.mapping.logo_url
            },
            service_info: {
              id: quote.service_id || request.mapping.service_id,
              name: quote.service_name || request.mapping.service_name || 'Service',
              description: quote.service_description || ''
            },
            price: {
              amount: parseFloat(quote.price?.amount || quote.price_amount || 0),
              vat: parseFloat(quote.price?.vat || quote.price_vat || 0),
              total: parseFloat(quote.price?.total || quote.price_total || 0),
              currency: quote.price?.currency || quote.currency || 'RON'
            },
            estimated_pickup_date: quote.estimated_pickup_date || 'Next business day',
            estimated_delivery_date: quote.estimated_delivery_date || '2-3 business days',
            carrier_id: request.mapping.carrier_id,
            service_id: quote.service_id || request.mapping.service_id
          }));

          console.log(`✓ Received ${quotes.length} quote(s) for ${request.mapping.carrier_name}`);
          return quotes;
        } else {
          throw new Error(data.message || 'Invalid response format');
        }
      } catch (error: any) {
        clearTimeout(timeoutId);
        console.warn(`✗ Quote failed: ${request.mapping.carrier_name} - ${error.message}`);
        return [];
      }
    };

    // Execute all requests concurrently
    const quotePromises = quoteRequests.map(request => fetchQuote(request));
    const results = await Promise.allSettled(quotePromises);
    
    const successfulQuotesRaw: any[] = results
      .filter((result): result is PromiseFulfilledResult<any[]> => 
        result.status === 'fulfilled' && Array.isArray(result.value)
      )
      .flatMap(result => result.value);

    // Dedupe by carrier_id + service_id
    const unique = new Map<string, any>();
    for (const q of successfulQuotesRaw) {
      const key = `${q.carrier_id}-${q.service_id}`;
      if (!unique.has(key)) unique.set(key, q);
    }
    const successfulQuotes = Array.from(unique.values());

    console.log(`=== Results: ${successfulQuotes.length}/${quoteRequests.length} quotes successful ===`);

    if (successfulQuotes.length > 0) {
      return new Response(JSON.stringify({
        success: true,
        carrier_options: successfulQuotes,
        debug_info: {
          total_attempts: quoteRequests.length,
          successful_quotes: successfulQuotes.length,
          base_url: BASE_URL,
          sender_address: senderParsed,
          recipient_address: recipientParsed
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fallback with user's default settings
    if (profile.eawb_default_carrier_id && profile.eawb_default_service_id) {
      console.log('Trying fallback with default carrier/service');
      
      const fallbackRequest = {
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
        parcels: [{
          weight: package_details.weight || 1,
          length: package_details.length || 30,
          width: package_details.width || 20,
          height: package_details.height || 10,
          contents: package_details.contents || 'Goods',
          declared_value: package_details.declared_value || order.total
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
        carrier_id: profile.eawb_default_carrier_id,
        service_id: profile.eawb_default_service_id
      };

      try {
        const response = await fetch(`${BASE_URL}/calculate-prices`, {
          method: 'POST',
          headers: {
            'X-API-Key': profile.eawb_api_key,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(fallbackRequest)
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.data) && data.data.length > 0) {
            const quote = data.data[0];
            return new Response(JSON.stringify({
              success: true,
              carrier_options: [{
                carrier_info: {
                  id: profile.eawb_default_carrier_id,
                  name: 'Default Carrier',
                  logo_url: null
                },
                service_info: {
                  id: profile.eawb_default_service_id,
                  name: 'Default Service',
                  description: 'Configured default shipping option'
                },
                price: {
                  amount: parseFloat(quote.price?.amount || quote.price_amount || 0),
                  vat: parseFloat(quote.price?.vat || quote.price_vat || 0),
                  total: parseFloat(quote.price?.total || quote.price_total || 0),
                  currency: quote.price?.currency || quote.currency || 'RON'
                },
                estimated_pickup_date: quote.estimated_pickup_date || 'Next business day',
                estimated_delivery_date: quote.estimated_delivery_date || '2-3 business days',
                carrier_id: profile.eawb_default_carrier_id,
                service_id: profile.eawb_default_service_id
              }],
              debug_info: { fallback_used: true }
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }
      } catch (error) {
        console.error('Fallback request failed:', error);
      }
    }

    // No quotes available
    return new Response(JSON.stringify({
      success: false,
      error: 'NO_QUOTES',
      message: 'No shipping quotes available. Please check your configuration.',
      debug_info: {
        total_attempts: quoteRequests.length,
        successful_quotes: 0,
        base_url: BASE_URL,
        has_fallback_config: !!(profile.eawb_default_carrier_id && profile.eawb_default_service_id)
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