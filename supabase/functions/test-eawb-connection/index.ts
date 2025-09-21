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
    console.log('eAWB key length:', profile.eawb_api_key?.length || 0);

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

    // Test different base URLs
    const baseUrls = [
      'https://api.europarcel.com/api/public',
      'https://api.europarcel.com/api/v1',
      'https://eawb.ro/api/public', 
      'https://eawb.ro/api/v1'
    ];

    const results = [];

    for (const baseUrl of baseUrls) {
      console.log(`\n=== Testing ${baseUrl} ===`);
      
      // Test /carriers endpoint
      try {
        const response = await fetch(`${baseUrl}/carriers`, {
          method: 'GET',
          headers: {
            'X-API-Key': profile.eawb_api_key,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });

        console.log(`Carriers endpoint status: ${response.status}`);
        
        let responseData = null;
        try {
          responseData = await response.json();
        } catch (e) {
          console.log('Failed to parse JSON response');
        }

        results.push({
          baseUrl,
          endpoint: 'carriers',
          status: response.status,
          success: response.ok,
          hasData: !!responseData,
          dataType: Array.isArray(responseData) ? 'array' : typeof responseData,
          dataLength: Array.isArray(responseData) ? responseData.length : 
                     Array.isArray(responseData?.data) ? responseData.data.length : 0,
          error: !response.ok ? responseData?.message || 'HTTP Error' : null
        });

        if (response.ok && responseData) {
          console.log('✓ Success! Data type:', Array.isArray(responseData) ? 'array' : typeof responseData);
          console.log('Data preview:', JSON.stringify(responseData).substring(0, 200));
        }

      } catch (error: any) {
        console.log('✗ Request failed:', error.message);
        results.push({
          baseUrl,
          endpoint: 'carriers',
          status: 0,
          success: false,
          error: error.message
        });
      }
    }

    // Try quote requests across all base URLs with multiple auth header variants
    const headerVariants = [
      { name: 'X-API-Key', build: (k: string) => ({ 'X-API-Key': k }) },
      { name: 'X-Api-Key', build: (k: string) => ({ 'X-Api-Key': k }) },
      { name: 'apikey', build: (k: string) => ({ 'apikey': k }) },
      { name: 'Authorization Bearer', build: (k: string) => ({ 'Authorization': `Bearer ${k}` }) },
      { name: 'Authorization ApiKey', build: (k: string) => ({ 'Authorization': `ApiKey ${k}` }) },
      { name: 'X-Auth-Token', build: (k: string) => ({ 'X-Auth-Token': k }) },
    ];

    const quotePayload = {
      billing_to: { billing_address_id: 1 },
      address_from: {
        country_code: 'RO',
        county_name: 'București',
        locality_name: 'București', 
        contact: 'Test Sender',
        street_name: 'Strada Test',
        street_number: '1',
        phone: '0700000000',
        email: user.email
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
      carrier_id: 0,
      service_id: 0
    };

    const quoteMatrix: any[] = [];
    let workingCombo: { baseUrl: string; headerVariant: string } | null = null;

    for (const baseUrl of baseUrls) {
      for (const hv of headerVariants) {
        try {
          const headers = {
            ...hv.build(profile.eawb_api_key as string),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          };
          const resp = await fetch(`${baseUrl}/calculate-prices`, {
            method: 'POST',
            headers,
            body: JSON.stringify(quotePayload)
          });
          let data: any = null;
          try { data = await resp.json(); } catch {}
          const ok = resp.ok && (data?.success === true || Array.isArray(data?.data));
          quoteMatrix.push({ baseUrl, headerVariant: hv.name, status: resp.status, ok, error: data?.message || null });
          if (!workingCombo && ok) {
            workingCombo = { baseUrl, headerVariant: hv.name };
          }
        } catch (e: any) {
          quoteMatrix.push({ baseUrl, headerVariant: hv.name, status: 0, ok: false, error: e.message });
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      profile: {
        hasApiKey: !!profile.eawb_api_key,
        apiKeyLength: profile.eawb_api_key?.length || 0,
        hasDefaults: !!(profile.eawb_default_carrier_id && profile.eawb_default_service_id),
        billingAddressId: profile.eawb_billing_address_id
      },
      connectionTests: results,
      workingEndpoint: workingCombo?.baseUrl || null,
      workingAuthHeader: workingCombo?.headerVariant || null,
      quoteMatrix
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});