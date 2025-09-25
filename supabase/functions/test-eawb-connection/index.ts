import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EAWB_BASE_URL = 'https://api.eawb.ro/api/public';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== eAWB Connection Test ===');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    // Get profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Profile not found');
    }

    console.log('Profile loaded, eAWB key present:', !!profile.eawb_api_key);

    if (!profile.eawb_api_key) {
      return new Response(JSON.stringify({
        success: false,
        error: 'NO_API_KEY',
        message: 'eAWB API key not configured'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = profile.eawb_api_key;
    const results = [];

    // Test 1: Get carriers
    console.log('Testing carriers endpoint...');
    try {
      const carriersResponse = await fetch(`${EAWB_BASE_URL}/carriers`, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const carriersData = await carriersResponse.json();
      results.push({
        test: 'carriers',
        url: `${EAWB_BASE_URL}/carriers`,
        status: carriersResponse.status,
        success: carriersResponse.ok,
        dataType: Array.isArray(carriersData?.data) ? 'array' : typeof carriersData,
        dataLength: Array.isArray(carriersData?.data) ? carriersData.data.length : 0,
        error: !carriersResponse.ok ? carriersData?.message || 'HTTP Error' : null
      });
      
      if (carriersResponse.ok) {
        console.log(`✓ Carriers endpoint working: ${carriersData?.data?.length || 0} carriers found`);
      }
    } catch (error: any) {
      results.push({
        test: 'carriers',
        url: `${EAWB_BASE_URL}/carriers`,
        status: 0,
        success: false,
        error: error.message
      });
    }

    // Test 2: Get services
    console.log('Testing services endpoint...');
    try {
      const servicesResponse = await fetch(`${EAWB_BASE_URL}/services`, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const servicesData = await servicesResponse.json();
      results.push({
        test: 'services',
        url: `${EAWB_BASE_URL}/services`,
        status: servicesResponse.status,
        success: servicesResponse.ok,
        dataType: Array.isArray(servicesData?.data) ? 'array' : typeof servicesData,
        dataLength: Array.isArray(servicesData?.data) ? servicesData.data.length : 0,
        error: !servicesResponse.ok ? servicesData?.message || 'HTTP Error' : null
      });
      
      if (servicesResponse.ok) {
        console.log(`✓ Services endpoint working: ${servicesData?.data?.length || 0} services found`);
      }
    } catch (error: any) {
      results.push({
        test: 'services',
        url: `${EAWB_BASE_URL}/services`,
        status: 0,
        success: false,
        error: error.message
      });
    }

    // Test 3: Calculate prices (quote test)
    console.log('Testing calculate-prices endpoint...');
    try {
      const quotePayload = {
        billing_to: { billing_address_id: profile.eawb_billing_address_id || 1 },
        address_from: {
          country_code: 'RO',
          county_name: 'Prahova',
          locality_name: 'Ploiesti',
          contact: profile.eawb_name || 'Test Sender',
          street_name: 'Strada Test',
          street_number: '1',
          phone: profile.eawb_phone || '0700000000',
          email: profile.eawb_email || user.email
        },
        address_to: {
          country_code: 'RO',
          county_name: 'București',
          locality_name: 'București',
          contact: 'Test Customer',
          street_name: 'Strada Victoriei',
          street_number: '1',
          phone: '0700000001',
          email: 'test@example.com'
        },
        parcels: [{
          weight: 1,
          length: 30,
          width: 20,
          height: 10,
          contents: 'Test goods',
          declared_value: 100
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
        carrier_id: 1, // Cargus
        service_id: 1  // Home to Home
      };

      const quoteResponse = await fetch(`${EAWB_BASE_URL}/calculate-prices`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(quotePayload)
      });

      const quoteData = await quoteResponse.json();
      results.push({
        test: 'calculate-prices',
        url: `${EAWB_BASE_URL}/calculate-prices`,
        status: quoteResponse.status,
        success: quoteResponse.ok && quoteData?.success,
        hasQuotes: quoteResponse.ok && Array.isArray(quoteData?.data) && quoteData.data.length > 0,
        quoteCount: quoteResponse.ok && Array.isArray(quoteData?.data) ? quoteData.data.length : 0,
        error: !quoteResponse.ok || !quoteData?.success ? quoteData?.message || 'No quotes returned' : null
      });
      
      if (quoteResponse.ok && quoteData?.success) {
        console.log(`✓ Quote endpoint working: ${quoteData?.data?.length || 0} quotes returned`);
      }
    } catch (error: any) {
      results.push({
        test: 'calculate-prices',
        url: `${EAWB_BASE_URL}/calculate-prices`,
        status: 0,
        success: false,
        error: error.message
      });
    }

    // Get database carriers for comparison
    const { data: dbCarriers } = await supabase
      .from('carriers')
      .select(`
        id, name, code, is_active,
        carrier_services (id, name, service_code, is_active)
      `)
      .eq('is_active', true);

    const summary = {
      apiConfigured: !!profile.eawb_api_key,
      billingAddressId: profile.eawb_billing_address_id,
      defaultCarrierId: profile.eawb_default_carrier_id,
      defaultServiceId: profile.eawb_default_service_id,
      carriersEndpoint: results.find(r => r.test === 'carriers')?.success || false,
      servicesEndpoint: results.find(r => r.test === 'services')?.success || false,
      quotingEndpoint: results.find(r => r.test === 'calculate-prices')?.success || false,
      databaseCarriers: dbCarriers?.length || 0,
      overallSuccess: results.every(r => r.success)
    };

    return new Response(JSON.stringify({
      success: true,
      baseUrl: EAWB_BASE_URL,
      profile: {
        hasApiKey: !!profile.eawb_api_key,
        billingAddressId: profile.eawb_billing_address_id,
        defaultCarrierId: profile.eawb_default_carrier_id,
        defaultServiceId: profile.eawb_default_service_id
      },
      tests: results,
      databaseCarriers: dbCarriers,
      summary
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Connection test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});