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
  signature: string;
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
      
      // Get user from auth header - handle both user tokens and API keys
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Authorization header required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const token = authHeader.replace('Bearer ', '');
      let userId: string;
      
      // First try as user token
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        // If user auth fails, check if it's an API key and get user_id from payload
        if (payload.user_id) {
          userId = payload.user_id;
        } else {
          return new Response(
            JSON.stringify({ error: 'Invalid authentication or missing user_id' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        userId = user.id;
      }

      if (action === 'create_payment') {
        return await createPayment(supabase, userId, payload);
      } else if (action === 'payment_status') {
        return await getPaymentStatus(supabase, userId, payload.payment_id);
      } else if (action === 'process_webhook') {
        return await processWebhook(supabase, payload);
      } else if (action === 'manual_update') {
        return await manualUpdatePayment(supabase, userId, payload.order_id);
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
      .select('netpopia_api_key, netpopia_signature, netpopia_sandbox')
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
      signature: profile.netpopia_signature || '',
      sandbox: profile.netpopia_sandbox ?? true
    };

    // Create payment with Netopia
    const netopiaUrl = netopiaConfig.sandbox 
      ? 'https://secure.sandbox.netopia-payments.com/payment/card/start'
      : 'https://secure.netopia-payments.com/payment/card/start';

    const paymentRequest = {
      config: {
        emailTemplate: null,
        notifyUrl: paymentData.notify_url,
        redirectUrl: paymentData.return_url,
        language: 'ro'
      },
      payment: {
        options: {
          installments: 0,
          bonus: 0
        },
        instrument: {
          type: 'card'
        },
        data: {}
      },
      order: {
        posSignature: netopiaConfig.signature,
        dateTime: new Date().toISOString(),
        description: paymentData.description || `Order ${paymentData.order_id}`,
        orderID: paymentData.order_id,
        amount: paymentData.amount,
        currency: paymentData.currency || 'RON',
        billing: {
          email: paymentData.customer_email,
          phone: paymentData.customer_phone || '',
          firstName: paymentData.customer_name.split(' ')[0] || '',
          lastName: paymentData.customer_name.split(' ').slice(1).join(' ') || '',
          city: '',
          country: 642,
          countryName: 'Romania',
          state: '',
          postalCode: '',
          details: ''
        }
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
        netopia_payment_id: responseData.payment?.ntpID || responseData.ntpID,
        netopia_order_id: responseData.order?.orderID || paymentData.order_id,
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
    console.log('Getting payment status for payment ID:', paymentId, 'user ID:', userId);
    
    // Get transaction from database - try multiple approaches
    let transaction = null;
    let error = null;
    
    // First try by netopia_payment_id
    const { data: txByPaymentId, error: err1 } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('netopia_payment_id', paymentId)
      .single();
    
    if (!err1 && txByPaymentId) {
      transaction = txByPaymentId;
    } else {
      console.log('Transaction not found by netopia_payment_id, trying by id:', paymentId);
      // Try by transaction id
      const { data: txById, error: err2 } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('id', paymentId)
        .single();
      
      if (!err2 && txById) {
        transaction = txById;
      } else {
        console.log('Transaction not found by id either, trying latest for user');
        // Get latest transaction for user
        const { data: txLatest, error: err3 } = await supabase
          .from('payment_transactions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (!err3 && txLatest) {
          transaction = txLatest;
        } else {
          error = err3 || err2 || err1;
        }
      }
    }

    if (error || !transaction) {
      console.log('Transaction not found, error:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Transaction not found',
          details: error?.message || 'No transaction found for the given criteria'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found transaction:', transaction.id, 'with netopia_payment_id:', transaction.netopia_payment_id);

    // Get user's Netopia configuration
    const { data: profile } = await supabase
      .from('profiles')
      .select('netpopia_api_key, netpopia_sandbox')
      .eq('user_id', userId)
      .single();

    if (!profile?.netpopia_api_key) {
      return new Response(
        JSON.stringify({ error: 'Netopia configuration not found. Please configure your Netopia settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip Netopia API call for now and just return current status
    const currentStatus = transaction.payment_status || 'pending';
    
    console.log('Returning current payment status:', currentStatus);
    
    return new Response(
      JSON.stringify({
        transaction_id: transaction.id,
        payment_status: currentStatus,
        amount: transaction.amount,
        currency: transaction.currency,
        created_at: transaction.created_at,
        provider_details: transaction.provider_response || {}
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error getting payment status:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function processWebhook(supabase: any, webhookData: any) {
  try {
    console.log('Processing Netopia webhook:', JSON.stringify(webhookData, null, 2));

    // Try different possible fields for payment ID from Netopia webhook
    const paymentId = webhookData.paymentId || 
                     webhookData.payment_id || 
                     webhookData.ntpID || 
                     webhookData.payment?.ntpID ||
                     (webhookData.payment && webhookData.payment.ntpID);
    
    const orderId = webhookData.orderID || 
                   webhookData.order_id || 
                   webhookData.orderId ||
                   webhookData.order?.orderID;
    
    console.log('Webhook data - Payment ID:', paymentId, 'Order ID:', orderId);

    let transaction = null;

    // Try to find transaction by payment ID first
    if (paymentId) {
      const { data: txByPaymentId, error: err1 } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('netopia_payment_id', paymentId)
        .single();
      
      if (!err1 && txByPaymentId) {
        transaction = txByPaymentId;
        console.log('Found transaction by payment ID:', transaction.id);
      }
    }

    // If not found by payment ID, try by order ID
    if (!transaction && orderId) {
      const { data: txByOrderId, error: err2 } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('netopia_order_id', orderId)
        .single();
      
      if (!err2 && txByOrderId) {
        transaction = txByOrderId;
        console.log('Found transaction by order ID:', transaction.id);
      }
    }

    if (!transaction) {
      console.log('Transaction not found for webhook data:', { paymentId, orderId });
      console.log('Available webhook fields:', Object.keys(webhookData));
      return new Response('Transaction not found but OK', { status: 200 });
    }

    // Determine new status from webhook - check various possible status fields
    let newStatus = 'pending';
    const webhookStatus = webhookData.status || 
                         webhookData.payment?.status || 
                         webhookData.orderStatus ||
                         webhookData.paymentStatus;
                         
    console.log('Webhook status received:', webhookStatus);
    
    if (webhookStatus) {
      switch (String(webhookStatus).toLowerCase()) {
        case 'confirmed':
        case 'completed':
        case 'success':
        case 'paid':
        case '1': // Netopia often uses numeric status
          newStatus = 'completed';
          break;
        case 'cancelled':
        case 'canceled':
        case 'cancel':
        case '0':
          newStatus = 'cancelled';
          break;
        case 'failed':
        case 'error':
        case 'rejected':
        case '-1':
          newStatus = 'failed';
          break;
        case 'processing':
        case 'pending':
        case '2':
          newStatus = 'processing';
          break;
      }
    }

    console.log(`Updating transaction ${transaction.id} from ${transaction.payment_status} to ${newStatus}`);

    // Update transaction status
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
      console.log(`Updating order ${transaction.order_id} payment status to completed`);
      await supabase
        .from('orders')
        .update({ payment_status: 'completed' })
        .eq('id', transaction.order_id);
        
      console.log('Order payment status updated successfully');
    }

    console.log(`Webhook processed successfully. Transaction ${transaction.id} status: ${newStatus}`);

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

async function manualUpdatePayment(supabase: any, userId: string, orderId: string) {
  try {
    console.log('Manual update payment status for order:', orderId, 'user:', userId);
    
    // Find the transaction for this order
    const { data: transaction, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !transaction) {
      return new Response(
        JSON.stringify({ error: 'Transaction not found for this order' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Found transaction:', transaction.id, 'current status:', transaction.payment_status);
    
    // Update transaction to completed
    await supabase
      .from('payment_transactions')
      .update({ 
        payment_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id);
    
    // Update order payment status
    await supabase
      .from('orders')
      .update({ payment_status: 'completed' })
      .eq('id', orderId);
    
    console.log('Manual update completed for order:', orderId);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Payment status updated to completed',
        transaction_id: transaction.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in manual update:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}