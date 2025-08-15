import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NetopiaPaymentRequest {
  order_id: string;
  amount: number;
  currency?: string;
  description?: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  return_url: string;
  notify_url: string;
}

interface NetopiaConfig {
  api_key: string;
  public_key: string;
  signature: string;
  pos_id: string;
  sandbox: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (req.method === 'POST') {
      const { action, ...payload } = await req.json();
      
      // Get user from auth header
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Authorization header required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authentication' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (action === 'create_payment') {
        return await createPayment(supabase, user.id, payload);
      } else if (action === 'payment_status') {
        return await getPaymentStatus(supabase, user.id, payload.payment_id);
      } else if (action === 'process_webhook') {
        return await processWebhook(supabase, payload);
      }
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in netopia-payment function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function createPayment(supabase: any, userId: string, paymentData: NetopiaPaymentRequest) {
  try {
    // Get user's Netopia configuration
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('netpopia_api_key, netpopia_public_key, netpopia_signature, netpopia_pos_id, netpopia_sandbox')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile?.netpopia_api_key) {
      return new Response(
        JSON.stringify({ error: 'Netopia configuration not found. Please configure your Netopia settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the order belongs to the user
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', paymentData.order_id)
      .eq('user_id', userId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const netopiaConfig: NetopiaConfig = {
      api_key: profile.netpopia_api_key,
      public_key: profile.netpopia_public_key || '',
      signature: profile.netpopia_signature || '',
      pos_id: profile.netpopia_pos_id || '',
      sandbox: profile.netpopia_sandbox ?? true
    };

    // Create payment with Netopia
    const netopiaUrl = netopiaConfig.sandbox 
      ? 'https://sandbox.netopia-payments.com/payment/card'
      : 'https://secure.netopia-payments.com/payment/card';

    const paymentRequest = {
      config: {
        emailTemplate: null,
        notifyUrl: paymentData.notify_url,
        redirectUrl: paymentData.return_url,
        language: 'ro'
      },
      payment: {
        options: {
          installments: 1,
          bonus: 0
        },
        instrument: {
          type: 'card',
          account: 'some-account',
          expMonth: 1,
          expYear: 2030,
          secretCode: '123'
        },
        data: [
          {
            ntpID: netopiaConfig.pos_id,
            posSignature: netopiaConfig.signature,
            isLive: !netopiaConfig.sandbox,
            orderId: paymentData.order_id,
            amount: paymentData.amount,
            currency: paymentData.currency || 'RON',
            orderDesc: paymentData.description || `Order ${paymentData.order_id}`,
            billing: {
              firstName: paymentData.customer_name.split(' ')[0] || '',
              lastName: paymentData.customer_name.split(' ').slice(1).join(' ') || '',
              email: paymentData.customer_email,
              phone: paymentData.customer_phone || '',
              address: '',
              city: '',
              zipCode: '',
              countryCode: 'RO'
            }
          }
        ]
      }
    };

    console.log('Creating Netopia payment request:', JSON.stringify(paymentRequest, null, 2));

    const netopiaResponse = await fetch(netopiaUrl, {
      method: 'POST',
      headers: {
        'Authorization': netopiaConfig.api_key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentRequest)
    });

    const responseData = await netopiaResponse.json();
    console.log('Netopia response:', JSON.stringify(responseData, null, 2));

    if (!netopiaResponse.ok) {
      console.error('Netopia payment creation failed:', responseData);
      
      // Store failed transaction
      await supabase.from('payment_transactions').insert({
        user_id: userId,
        order_id: paymentData.order_id,
        payment_provider: 'netopia',
        payment_status: 'failed',
        amount: paymentData.amount,
        currency: paymentData.currency || 'RON',
        provider_response: responseData,
        error_message: responseData.message || 'Payment creation failed'
      });

      return new Response(
        JSON.stringify({ 
          error: 'Payment creation failed', 
          details: responseData.message || 'Unknown error' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store successful payment transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('payment_transactions')
      .insert({
        user_id: userId,
        order_id: paymentData.order_id,
        payment_provider: 'netopia',
        payment_status: 'pending',
        amount: paymentData.amount,
        currency: paymentData.currency || 'RON',
        netopia_payment_id: responseData.paymentId || responseData.payment?.paymentId,
        netopia_order_id: responseData.orderId || responseData.payment?.orderId,
        provider_response: responseData
      })
      .select()
      .single();

    if (transactionError) {
      console.error('Failed to store transaction:', transactionError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: responseData.paymentURL || responseData.payment?.paymentURL,
        payment_id: responseData.paymentId || responseData.payment?.paymentId,
        transaction_id: transaction?.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating Netopia payment:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function getPaymentStatus(supabase: any, userId: string, paymentId: string) {
  try {
    // Get transaction from database
    const { data: transaction, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('netopia_payment_id', paymentId)
      .single();

    if (error || !transaction) {
      return new Response(
        JSON.stringify({ error: 'Transaction not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's Netopia configuration
    const { data: profile } = await supabase
      .from('profiles')
      .select('netpopia_api_key, netpopia_sandbox')
      .eq('user_id', userId)
      .single();

    if (!profile?.netpopia_api_key) {
      return new Response(
        JSON.stringify({ error: 'Netopia configuration not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query Netopia for payment status
    const netopiaUrl = profile.netpopia_sandbox 
      ? `https://sandbox.netopia-payments.com/payment/card/${paymentId}`
      : `https://secure.netopia-payments.com/payment/card/${paymentId}`;

    const statusResponse = await fetch(netopiaUrl, {
      method: 'GET',
      headers: {
        'Authorization': profile.netpopia_api_key,
        'Content-Type': 'application/json'
      }
    });

    const statusData = await statusResponse.json();

    // Update local transaction status
    let newStatus = transaction.payment_status;
    if (statusData.status) {
      switch (statusData.status.toLowerCase()) {
        case 'confirmed':
        case 'completed':
          newStatus = 'completed';
          break;
        case 'cancelled':
        case 'canceled':
          newStatus = 'cancelled';
          break;
        case 'failed':
          newStatus = 'failed';
          break;
        case 'pending':
        case 'processing':
          newStatus = 'processing';
          break;
      }
    }

    if (newStatus !== transaction.payment_status) {
      await supabase
        .from('payment_transactions')
        .update({ 
          payment_status: newStatus,
          provider_response: statusData 
        })
        .eq('id', transaction.id);

      // Update order payment status if completed
      if (newStatus === 'completed') {
        await supabase
          .from('orders')
          .update({ payment_status: 'completed' })
          .eq('id', transaction.order_id);
      }
    }

    return new Response(
      JSON.stringify({
        transaction_id: transaction.id,
        payment_status: newStatus,
        amount: transaction.amount,
        currency: transaction.currency,
        created_at: transaction.created_at,
        provider_details: statusData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error getting payment status:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function processWebhook(supabase: any, webhookData: any) {
  try {
    console.log('Processing Netopia webhook:', JSON.stringify(webhookData, null, 2));

    // Find transaction by Netopia payment ID
    const { data: transaction, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('netopia_payment_id', webhookData.paymentId || webhookData.payment_id)
      .single();

    if (error || !transaction) {
      console.log('Transaction not found for webhook:', webhookData.paymentId || webhookData.payment_id);
      return new Response('OK', { status: 200 });
    }

    // Update transaction status based on webhook
    let newStatus = 'pending';
    if (webhookData.status) {
      switch (webhookData.status.toLowerCase()) {
        case 'confirmed':
        case 'completed':
          newStatus = 'completed';
          break;
        case 'cancelled':
        case 'canceled':
          newStatus = 'cancelled';
          break;
        case 'failed':
          newStatus = 'failed';
          break;
        case 'processing':
          newStatus = 'processing';
          break;
      }
    }

    await supabase
      .from('payment_transactions')
      .update({ 
        payment_status: newStatus,
        provider_response: webhookData,
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id);

    // Update order status if payment completed
    if (newStatus === 'completed') {
      await supabase
        .from('orders')
        .update({ payment_status: 'completed' })
        .eq('id', transaction.order_id);
    }

    console.log(`Updated transaction ${transaction.id} to status: ${newStatus}`);

    return new Response('OK', { 
      status: 200,
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response('Error', { 
      status: 500,
      headers: corsHeaders 
    });
  }
}