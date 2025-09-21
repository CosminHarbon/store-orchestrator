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
    console.log('=== eAWB API Diagnosis ===');
    
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

    const apiKey = profile.eawb_api_key;
    if (!apiKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'NO_API_KEY'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Testing with API key:', `${apiKey.substring(0, 10)}...`);

    // Try the most direct approach - just hit calculate-prices directly
    const testPayload = {
      billing_to: { billing_address_id: 157122 }, // Use actual billing address ID
      address_from: {
        country_code: 'RO',
        county_name: 'Prahova',
        locality_name: 'Ploiesti',
        contact: 'Midbay Holding',
        street_name: 'Strada Republicii',
        street_number: '15',
        phone: '0721046211',
        email: 'andrei.cosmin.nita@cn-caragiale.ro'
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
      carrier_id: 0, // All carriers
      service_id: 0  // All services
    };

    const testUrls = [
      'https://api.europarcel.com/api/public/calculate-prices',
      'https://api.europarcel.com/api/v1/calculate-prices', 
      'https://eawb.ro/api/public/calculate-prices',
      'https://eawb.ro/api/v1/calculate-prices',
      'https://api.europarcel.com/calculate-prices',
      'https://eawb.ro/api/calculate-prices',
      'https://api.eawb.ro/api/public/calculate-prices',
      'https://api.eawb.ro/v1/calculate-prices'
    ];

    const testResults = [];
    let workingConfig = null;

    for (const testUrl of testUrls) {
      console.log(`\n--- Testing: ${testUrl} ---`);
      
      try {
        const response = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(testPayload)
        });

        const status = response.status;
        let data = null;
        let errorMsg = null;

        try {
          data = await response.json();
          if (!response.ok) {
            errorMsg = data?.message || data?.error || `HTTP ${status}`;
          }
        } catch (e) {
          errorMsg = 'Invalid JSON response';
        }

        const success = response.ok && data;
        console.log(`Result: ${status} - ${success ? 'SUCCESS' : errorMsg}`);

        if (success) {
          console.log('Response data:', JSON.stringify(data).substring(0, 300));
        }

        testResults.push({
          url: testUrl,
          status,
          success,
          error: errorMsg,
          hasQuotes: success && Array.isArray(data?.data) && data.data.length > 0,
          quoteCount: success && Array.isArray(data?.data) ? data.data.length : 0
        });

        if (success && !workingConfig) {
          workingConfig = { 
            url: testUrl,
            baseUrl: testUrl.replace('/calculate-prices', ''),
            authHeader: 'X-API-Key'
          };
          console.log('🎉 FOUND WORKING CONFIG:', workingConfig);
        }

      } catch (error: any) {
        console.log(`Network error: ${error.message}`);
        testResults.push({
          url: testUrl,
          status: 0,
          success: false,
          error: error.message
        });
      }
    }

    console.log('=== DIAGNOSIS COMPLETE ===');
    console.log(`Working config found: ${!!workingConfig}`);
    if (workingConfig) {
      console.log('Working config details:', JSON.stringify(workingConfig));
    }

    return new Response(JSON.stringify({
      success: true,
      apiKeyPresent: !!apiKey,
      apiKeyPrefix: apiKey.substring(0, 10) + '...',
      profileData: {
        billingAddressId: profile.eawb_billing_address_id,
        defaultCarrierId: profile.eawb_default_carrier_id,
        defaultServiceId: profile.eawb_default_service_id
      },
      testResults,
      workingConfig,
      totalAttempts: testResults.length,
      successfulAttempts: testResults.filter(r => r.success).length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Diagnosis error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});