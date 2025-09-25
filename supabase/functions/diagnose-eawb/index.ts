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

    // Comprehensive diagnosis
    const diagnosis: {
      apiKey: {
        present: boolean;
        length: number;
        format: string;
      };
      profile: {
        billingAddressId: number | null;
        defaultCarrierId: number | null;
        defaultServiceId: number | null;
        senderInfo: {
          name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
        };
      };
      endpoints: Array<{
        name: string;
        url: string;
        status: number;
        success: boolean;
        hasData?: boolean;
        dataType?: string;
        dataLength?: number;
        message?: string | null;
        error?: string | null;
        hasQuotes?: boolean;
        quoteCount?: number;
      }>;
      carriers: any[];
      services: any[];
      quoteTest: {
        success: boolean;
        quotesCount: number;
        sampleQuote: any;
      } | null;
    } = {
      apiKey: {
        present: !!apiKey,
        length: apiKey.length,
        format: apiKey.includes('-') ? 'UUID-like' : 'token-like'
      },
      profile: {
        billingAddressId: profile.eawb_billing_address_id,
        defaultCarrierId: profile.eawb_default_carrier_id,
        defaultServiceId: profile.eawb_default_service_id,
        senderInfo: {
          name: profile.eawb_name,
          email: profile.eawb_email,
          phone: profile.eawb_phone,
          address: profile.eawb_address
        }
      },
      endpoints: [],
      carriers: [],
      services: [],
      quoteTest: null
    };

    // Test main endpoints
    const endpoints = [
      { name: 'carriers', path: '/carriers' },
      { name: 'services', path: '/services' },
      { name: 'calculate-prices', path: '/calculate-prices', method: 'POST' }
    ];

    for (const endpoint of endpoints) {
      try {
        let response;
        const headers = {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        };

        if (endpoint.method === 'POST') {
          // Use a minimal test payload for POST requests
          const testPayload = {
            billing_to: { billing_address_id: profile.eawb_billing_address_id || 1 },
            address_from: {
              country_code: 'RO',
              county_name: 'București',
              locality_name: 'București',
              contact: 'Test',
              street_name: 'Test',
              street_number: '1',
              phone: '0700000000',
              email: 'test@test.ro'
            },
            address_to: {
              country_code: 'RO',
              county_name: 'Cluj',
              locality_name: 'Cluj-Napoca',
              contact: 'Test',
              street_name: 'Test',
              street_number: '1',
              phone: '0700000001',
              email: 'test2@test.ro'
            },
            parcels: [{ weight: 1, length: 10, width: 10, height: 10, contents: 'Test', declared_value: 50 }],
            service: { currency: 'RON', payment_type: 1 },
            carrier_id: 1,
            service_id: 1
          };
          
          response = await fetch(`${EAWB_BASE_URL}${endpoint.path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(testPayload)
          });
        } else {
          response = await fetch(`${EAWB_BASE_URL}${endpoint.path}`, {
            method: 'GET',
            headers
          });
        }

        const data = await response.json();
        
        diagnosis.endpoints.push({
          name: endpoint.name,
          url: `${EAWB_BASE_URL}${endpoint.path}`,
          status: response.status,
          success: response.ok,
          hasData: !!data,
          dataType: Array.isArray(data?.data) ? 'array' : typeof data,
          dataLength: Array.isArray(data?.data) ? data.data.length : 0,
          message: data?.message || null,
          error: !response.ok ? data?.error || `HTTP ${response.status}` : null
        });

        // Store specific data for analysis
        if (response.ok && endpoint.name === 'carriers' && data?.data) {
          diagnosis.carriers = data.data.slice(0, 10); // First 10 carriers
        }
        if (response.ok && endpoint.name === 'services' && data?.data) {
          diagnosis.services = data.data.slice(0, 20); // First 20 services
        }
        if (response.ok && endpoint.name === 'calculate-prices') {
          diagnosis.quoteTest = {
            success: data?.success || false,
            quotesCount: Array.isArray(data?.data) ? data.data.length : 0,
            sampleQuote: Array.isArray(data?.data) && data.data.length > 0 ? data.data[0] : null
          };
        }

      } catch (error: any) {
        diagnosis.endpoints.push({
          name: endpoint.name,
          url: `${EAWB_BASE_URL}${endpoint.path}`,
          status: 0,
          success: false,
          error: error.message
        });
      }
    }

    // Get database carriers and services for comparison
    const { data: dbCarriers } = await supabase
      .from('carriers')
      .select(`
        id, name, code, is_active,
        carrier_services (id, name, service_code, description, is_active)
      `)
      .eq('is_active', true);

    // Analysis and recommendations
    const analysis = {
      apiWorking: diagnosis.endpoints.some(e => e.success),
      carriersEndpointWorking: diagnosis.endpoints.find(e => e.name === 'carriers')?.success || false,
      servicesEndpointWorking: diagnosis.endpoints.find(e => e.name === 'services')?.success || false,
      quotingEndpointWorking: diagnosis.endpoints.find(e => e.name === 'calculate-prices')?.success || false,
      databaseCarriersCount: dbCarriers?.length || 0,
      configurationComplete: !!(
        profile.eawb_api_key && 
        profile.eawb_billing_address_id && 
        profile.eawb_name && 
        profile.eawb_email
      )
    };

    const recommendations = [];
    
    if (!analysis.apiWorking) {
      recommendations.push('API key appears to be invalid or API is not accessible');
    }
    if (!analysis.configurationComplete) {
      recommendations.push('Complete eAWB configuration in Store Settings (billing address, sender info)');
    }
    if (!analysis.quotingEndpointWorking && analysis.apiWorking) {
      recommendations.push('Quote endpoint not working - check billing address ID and sender information');
    }
    if (analysis.databaseCarriersCount === 0) {
      recommendations.push('No carriers configured in database - run carrier migration');
    }

    if (analysis.apiWorking && analysis.quotingEndpointWorking && analysis.configurationComplete) {
      recommendations.push('✅ eAWB integration appears to be working correctly');
    }

    return new Response(JSON.stringify({
      success: true,
      baseUrl: EAWB_BASE_URL,
      diagnosis,
      databaseCarriers: dbCarriers,
      analysis,
      recommendations,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Diagnosis error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});