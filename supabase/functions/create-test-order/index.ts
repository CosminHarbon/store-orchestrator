import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the first user_id from profiles
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('user_id')
      .limit(1)
      .single()

    if (profileError) throw profileError

    // Create the test order
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .insert({
        customer_name: 'BARRY WHITE',
        customer_email: 'barry.white@example.com',
        customer_phone: '+40712345678',
        customer_address: 'Strada Republicii Nr. 25, Ploiești, Prahova',
        customer_city: 'Ploiești',
        customer_county: 'Prahova',
        customer_street: 'Strada Republicii',
        customer_street_number: '25',
        total: 150.00,
        payment_status: 'pending',
        shipping_status: 'pending',
        user_id: profile.user_id
      })
      .select()
      .single()

    if (orderError) throw orderError

    return new Response(
      JSON.stringify({ 
        success: true, 
        order,
        message: 'Test order created successfully' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error creating test order:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
