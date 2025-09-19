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

    console.log('Order customer address:', order.customer_address);

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

    // Parse addresses
    const senderAddress = parseRomanianAddress(profile.address || 'Bucuresti, Romania');
    const recipientAddress = address_override || parseRomanianAddress(order.customer_address);
    
    console.log('Sender address parsed:', senderAddress);
    console.log('Recipient address parsed:', recipientAddress);

    // Get active carriers
    const { data: carriers, error: carriersError } = await supabase
      .from('carriers')
      .select(`
        *,
        carrier_services (
          id,
          service_name,
          service_description,
          base_price,
          price_per_kg,
          is_active
        )
      `)
      .eq('is_active', true);

    if (carriersError) throw new Error('Failed to fetch carriers');
    console.log(`Found ${carriers.length} active carriers`);

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

    // Try each carrier
    for (const carrier of carriers) {
      const attemptResult = {
        carrier_name: carrier.name,
        carrier_id: carrier.id,
        success: false,
        error: null as string | null,
        quotes: [] as any[]
      };

      try {
        console.log(`Attempting carrier: ${carrier.name}`);
        
        const eawbPayload = {
          action: 'calculate-prices',
          sender: {
            name: profile.store_name || 'My Store',
            contact: profile.contact_person || profile.store_name || 'Store Manager',
            phone: profile.phone || order.customer_phone || '+40700000000',
            email: profile.email || user.email,
            address: {
              city: senderAddress.city,
              county: senderAddress.county,
              postal_code: senderAddress.postal_code,
              address: profile.address || 'Bucuresti, Romania'
            }
          },
          recipient: {
            name: order.customer_name,
            contact: order.customer_name,
            phone: order.customer_phone || '+40700000000',
            email: order.customer_email,
            address: {
              city: recipientAddress.city,
              county: recipientAddress.county,
              postal_code: recipientAddress.postal_code,
              address: order.customer_address
            }
          },
          parcel,
          service_info: {
            cod_amount: package_details.cod_amount || 0,
            contents: package_details.contents || 'Various items'
          }
        };

        console.log(`Request payload for ${carrier.name}:`, JSON.stringify(eawbPayload, null, 2));

        const response = await fetch(`https://www.eawb.ro/api/v2/carriers/${carrier.external_id}/calculate-prices`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('EAWB_API_KEY')}`
          },
          body: JSON.stringify(eawbPayload)
        });

        const responseText = await response.text();
        console.log(`Raw response from ${carrier.name}:`, responseText);

        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}`);
        }

        if (response.ok && responseData.success) {
          const quotes = Array.isArray(responseData.data) ? responseData.data : [responseData.data];
          attemptResult.success = true;
          attemptResult.quotes = quotes;
          
          for (const quote of quotes) {
            carrierQuotes.push({
              carrier_info: {
                id: carrier.id,
                name: carrier.name,
                logo_url: carrier.logo_url
              },
              service_info: {
                id: quote.service_id || 1,
                name: quote.service_name || 'Standard',
                description: quote.service_description || ''
              },
              price: {
                amount: parseFloat(quote.price_amount || quote.amount || 0),
                vat: parseFloat(quote.price_vat || quote.vat || 0),
                total: parseFloat(quote.price_total || quote.total || 0),
                currency: quote.currency || 'RON'
              },
              estimated_pickup_date: quote.estimated_pickup_date || 'Next business day',
              estimated_delivery_date: quote.estimated_delivery_date || '2-3 business days',
              carrier_id: carrier.external_id,
              service_id: quote.service_id || 1
            });
          }
          
          console.log(`Success: Got ${quotes.length} quotes from ${carrier.name}`);
        } else {
          const errorMsg = responseData.message || responseData.error || `HTTP ${response.status}`;
          attemptResult.error = errorMsg;
          console.log(`Failed for ${carrier.name}:`, errorMsg);
        }
      } catch (error: any) {
        attemptResult.error = error.message;
        console.log(`Exception for ${carrier.name}:`, error.message);
      }
      
      attemptResults.push(attemptResult);
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