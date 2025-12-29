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
      const payload = await req.json();
      const { action } = payload;
      
      console.log('=== NETOPIA PAYMENT FUNCTION CALLED ===');
      console.log('Headers:', Object.fromEntries(req.headers.entries()));
      console.log('Payload keys:', Object.keys(payload));
      console.log('Action field:', action || 'NOT PROVIDED');
      console.log('Full payload:', JSON.stringify(payload, null, 2));
      
      // AUTO-DETECT WEBHOOK: Check if this is a Netopia webhook (no action field but has webhook data)
      const hasWebhookFields = (
        payload.ntpID || 
        payload.paymentId || 
        payload.payment_id ||
        payload.orderID || 
        payload.order_id ||
        payload.status ||
        (payload.payment && (payload.payment.ntpID || payload.payment.status)) ||
        (payload.order && payload.order.orderID)
      );
      
      const isWebhook = !action && hasWebhookFields;
      
      if (isWebhook) {
      console.log('🔔 DETECTED AS WEBHOOK (no action field, has Netopia webhook fields)');
        console.log('Processing as unauthenticated webhook...');
        return await processWebhook(supabase, payload);
      }
      
      console.log('Processing as authenticated request with action:', action);
      
      // For requests with action field (internal calls or authenticated requests)
      const authHeader = req.headers.get('Authorization');
      let userId: string;
      
      if (authHeader) {
        console.log('Authorization header present, validating...');
        const token = authHeader.replace('Bearer ', '');
        
        // Try to validate as user token
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (user && !authError) {
          userId = user.id;
          console.log('✓ Authenticated as user:', userId);
        } else if (payload.user_id) {
          // If auth fails but user_id is provided (internal edge function call)
          userId = payload.user_id;
          console.log('✓ Using user_id from payload (internal call):', userId);
        } else {
          console.error('❌ Invalid authentication');
          return new Response(
            JSON.stringify({ error: 'Invalid authentication' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else if (payload.user_id && action) {
        // No auth header but has user_id and action (internal edge function call)
        userId = payload.user_id;
        console.log('✓ Using user_id from payload (internal call, no auth header):', userId);
      } else {
        console.error('❌ No authentication provided');
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Handle different actions
      if (action === 'create_payment') {
        console.log('→ Routing to createPayment()');
        return await createPayment(supabase, userId, payload);
      } else if (action === 'payment_status') {
        console.log('→ Routing to getPaymentStatus()');
        return await getPaymentStatus(supabase, userId, payload.payment_id);
      } else if (action === 'process_webhook') {
        console.log('→ Routing to processWebhook() (explicit action)');
        return await processWebhook(supabase, payload);
      } else if (action === 'manual_update') {
        console.log('→ Routing to manualUpdatePayment()');
        return await manualUpdatePayment(supabase, userId, payload.order_id);
      } else {
        console.error('❌ Unknown action:', action);
        return new Response(
          JSON.stringify({ error: 'Unknown action', action }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('❌ Method not allowed:', req.method);
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('💥 ERROR in netopia-payment function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Error stack:', errorStack);
    return new Response(
      JSON.stringify({ error: errorMessage }),
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

  } catch (error: unknown) {
    console.error('Error creating Netopia payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
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

  } catch (error: unknown) {
    console.error('Error getting payment status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: errorMessage 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function processWebhook(supabase: any, webhookData: any) {
  try {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔔 PROCESSING NETOPIA WEBHOOK');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Webhook data received:', JSON.stringify(webhookData, null, 2));
    console.log('Available fields in webhook:', Object.keys(webhookData));

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
    
    console.log('');
    console.log('--- Extracted IDs ---');
    console.log('Payment ID (ntpID):', paymentId || 'NOT FOUND');
    console.log('Order ID:', orderId || 'NOT FOUND');
    
    if (!paymentId && !orderId) {
      console.error('⚠️  WARNING: No payment ID or order ID found in webhook!');
      console.error('This might not be a valid Netopia webhook payload.');
    }

    let transaction = null;

    console.log('');
    console.log('--- Looking up transaction in database ---');
    
    // Try to find transaction by payment ID first
    if (paymentId) {
      console.log('Searching by netopia_payment_id:', paymentId);
      const { data: txByPaymentId, error: err1 } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('netopia_payment_id', paymentId)
        .single();
      
      if (!err1 && txByPaymentId) {
        transaction = txByPaymentId;
        console.log('✓ Found transaction by payment ID:', transaction.id);
      } else {
        console.log('✗ Not found by payment ID. Error:', err1?.message || 'none');
      }
    }

    // If not found by payment ID, try by order ID
    if (!transaction && orderId) {
      console.log('Searching by netopia_order_id:', orderId);
      const { data: txByOrderId, error: err2 } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('netopia_order_id', orderId)
        .single();
      
      if (!err2 && txByOrderId) {
        transaction = txByOrderId;
        console.log('✓ Found transaction by order ID:', transaction.id);
      } else {
        console.log('✗ Not found by order ID. Error:', err2?.message || 'none');
      }
    }

    if (!transaction) {
      console.error('');
      console.error('❌ TRANSACTION NOT FOUND');
      console.error('Searched for:');
      console.error('  - netopia_payment_id:', paymentId || 'N/A');
      console.error('  - netopia_order_id:', orderId || 'N/A');
      console.error('Available webhook fields:', Object.keys(webhookData));
      console.error('');
      console.log('Returning 200 OK to Netopia (to prevent retries)');
      return new Response('Transaction not found but OK', { status: 200 });
    }

    console.log('');
    console.log('--- Determining payment status ---');
    
    // Determine new status from webhook - check various possible status fields
    let newStatus = 'pending';
    const webhookStatus = webhookData.status || 
                         webhookData.payment?.status || 
                         webhookData.orderStatus ||
                         webhookData.paymentStatus;
    
    // Also check the code field - Netopia sends "00" for approved payments
    const webhookCode = webhookData.code || webhookData.payment?.code;
    const webhookMessage = webhookData.message || webhookData.payment?.message;
                         
    console.log('Raw webhook fields:');
    console.log('  status:', webhookStatus, '(type:', typeof webhookStatus, ')');
    console.log('  code:', webhookCode);
    console.log('  message:', webhookMessage);
    
    // Netopia status codes:
    // 0 = Inactive/Open
    // 1 = New/Pending 3DS
    // 2 = In Progress
    // 3 = Paid/Approved ✓ ← THIS IS THE KEY ONE!
    // 4-9 = Rejected/Credit/Reversed etc.
    //
    // Error codes:
    // "00" = Approved/Success
    // Other codes = various errors
    
    // First check if payment is approved by code
    if (webhookCode === '00') {
      newStatus = 'completed';
      console.log('→ Payment APPROVED by code "00" ✓');
    } 
    // Then check status code
    else if (webhookStatus !== undefined && webhookStatus !== null) {
      const statusStr = String(webhookStatus);
      console.log('Checking status code:', statusStr);
      
      switch (statusStr) {
        case '3': // APPROVED/PAID - This is the missing case!
          newStatus = 'completed';
          console.log('→ Status 3: Payment APPROVED/PAID ✓');
          break;
        case '1': // New/Pending 3DS
          newStatus = 'processing';
          console.log('→ Status 1: Processing/Pending 3DS');
          break;
        case '2': // In Progress
          newStatus = 'processing';
          console.log('→ Status 2: In Progress');
          break;
        case '0': // Inactive
        case '4': // Rejected
        case '5': // Credit
        case '6': // Chargeback
          newStatus = 'cancelled';
          console.log('→ Status', statusStr, ': Cancelled/Rejected');
          break;
        case 'confirmed':
        case 'completed':
        case 'success':
        case 'paid':
          newStatus = 'completed';
          console.log('→ Text status: COMPLETED ✓');
          break;
        case 'cancelled':
        case 'canceled':
        case 'cancel':
          newStatus = 'cancelled';
          console.log('→ Text status: CANCELLED');
          break;
        case 'failed':
        case 'error':
        case 'rejected':
          newStatus = 'failed';
          console.log('→ Text status: FAILED');
          break;
        case 'processing':
        case 'pending':
          newStatus = 'processing';
          console.log('→ Text status: PROCESSING');
          break;
        default:
          console.log('⚠️  Unknown status code:', statusStr, '- keeping as PENDING');
      }
    } else {
      console.warn('⚠️  No status or code field found in webhook, defaulting to: PENDING');
    }

    console.log('');
    console.log('--- Updating database ---');
    console.log(`Transaction ${transaction.id}:`);
    console.log(`  Current status: ${transaction.payment_status}`);
    console.log(`  New status: ${newStatus}`);

    // Update transaction status
    const { error: updateError } = await supabase
      .from('payment_transactions')
      .update({ 
        payment_status: newStatus,
        provider_response: webhookData,
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id);
      
    if (updateError) {
      console.error('❌ Failed to update transaction:', updateError);
    } else {
      console.log('✓ Transaction updated successfully');
    }

    // Update order status if payment completed
    if (newStatus === 'completed') {
      console.log('');
      console.log('--- Payment completed! Updating order ---');
      console.log(`Order ID: ${transaction.order_id}`);
      console.log('Setting payment_status = "paid" and order_status = "paid"');
      
      // Get order details for notification
      const { data: order, error: orderFetchError } = await supabase
        .from('orders')
        .select('id, user_id, customer_name, total')
        .eq('id', transaction.order_id)
        .single();
      
      const { error: orderError } = await supabase
        .from('orders')
        .update({ 
          payment_status: 'paid',
          order_status: 'paid'
        })
        .eq('id', transaction.order_id);
        
      if (orderError) {
        console.error('❌ Failed to update order:', orderError);
      } else {
        console.log('✓ Order updated successfully - status is now PAID');
        
        // Send push notification for paid order
        if (order && !orderFetchError) {
          try {
            await supabase.functions.invoke('push-notification', {
              body: {
                action: 'send',
                user_ids: [order.user_id],
                title: '💳 Plată confirmată!',
                message: `Comandă plătită de ${parseFloat(order.total).toFixed(2)} RON de la ${order.customer_name}`,
                notification_type: 'order_update',
                data: {
                  order_id: order.id,
                  total: order.total.toString(),
                  customer_name: order.customer_name
                }
              }
            });
            console.log('✓ Push notification sent for paid order:', order.id);
          } catch (pushError) {
            console.error('Failed to send push notification:', pushError);
            // Don't fail the webhook if push fails
          }
        }
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ WEBHOOK PROCESSED SUCCESSFULLY');
    console.log(`Transaction: ${transaction.id}`);
    console.log(`Final status: ${newStatus}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    return new Response('OK', { 
      status: 200,
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════');
    console.error('💥 ERROR PROCESSING WEBHOOK');
    console.error('═══════════════════════════════════════════════════════');
    console.error('Error:', error);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown');
    console.error('Error stack:', error instanceof Error ? error.stack : '');
    console.error('═══════════════════════════════════════════════════════');
    console.error('');
    
    // Still return 200 to prevent Netopia from retrying
    return new Response('Error logged but returning OK', { 
      status: 200,
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
      // Fallback: if no transaction exists, still allow marking the order as paid
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id')
        .eq('id', orderId)
        .eq('user_id', userId)
        .single();

      if (orderError || !order) {
        return new Response(
          JSON.stringify({ error: 'Transaction not found and order not accessible' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase
        .from('orders')
        .update({ payment_status: 'paid' })
        .eq('id', orderId);

      console.log('No transaction found; order status marked as paid directly:', orderId);

      return new Response(
        JSON.stringify({ success: true, message: 'Order marked as paid' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    
    // Update order payment status to 'paid' (matches UI expectations)
    await supabase
      .from('orders')
      .update({ payment_status: 'paid' })
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
    
  } catch (error: unknown) {
    console.error('Error in manual update:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}