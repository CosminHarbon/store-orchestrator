import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import * as jose from 'https://esm.sh/jose@5.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, verification-token',
};

// Official status codes from netopia-payment2 constants / OpenAPI NotifyRequest
const STATUS = {
  NEW: 1,
  OPENED: 2,
  PAID: 3,
  CANCELED: 4,
  CONFIRMED: 5,
  PENDING: 6,
  SCHEDULED: 7,
  CREDIT: 8,
  CHARGEBACK_INIT: 9,
  CHARGEBACK_ACCEPT: 10,
  ERROR: 11,
  DECLINED: 12,
  FRAUD: 13,
  PENDING_AUTH: 14,
  AUTH_3D: 15,
  REVERSED: 17,
  EXPIRED: 23,
} as const;

interface NetopiaPaymentRequest {
  order_id?: string;
  checkout_session_id?: string;
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
  public_key?: string | null;
}

/** Live base matches official netopia-payment2 SDK. Sandbox matches OpenAPI servers. */
function getNetopiaBaseUrl(sandbox: boolean): string {
  return sandbox
    ? 'https://secure.sandbox.netopia-payments.com'
    : 'https://secure.netopia-payments.com';
}

function getNested(obj: any, paths: string[][]): any {
  for (const path of paths) {
    let cur = obj;
    let ok = true;
    for (const key of path) {
      if (cur == null || typeof cur !== 'object' || !(key in cur)) {
        ok = false;
        break;
      }
      cur = cur[key];
    }
    if (ok && cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return null;
}

/** Support flat OpenAPI StartResponse and SDK-wrapped { data: { payment } } shapes. */
function extractPaymentFields(responseData: any) {
  const paymentURL = getNested(responseData, [
    ['paymentURL'],
    ['payment', 'paymentURL'],
    ['data', 'payment', 'paymentURL'],
    ['data', 'paymentURL'],
  ]);
  const ntpID = getNested(responseData, [
    ['ntpID'],
    ['payment', 'ntpID'],
    ['data', 'payment', 'ntpID'],
    ['data', 'ntpID'],
  ]);
  const paymentId = getNested(responseData, [
    ['paymentId'],
    ['payment', 'paymentId'],
    ['data', 'payment', 'paymentId'],
    ['data', 'paymentId'],
  ]);
  const orderID = getNested(responseData, [
    ['order', 'orderID'],
    ['data', 'order', 'orderID'],
    ['orderID'],
    ['data', 'orderID'],
  ]);
  const errorCode = String(
    getNested(responseData, [
      ['error', 'code'],
      ['data', 'error', 'code'],
      ['code'],
    ]) ?? ''
  );
  const errorMessage = String(
    getNested(responseData, [
      ['error', 'message'],
      ['data', 'error', 'message'],
      ['message'],
    ]) ?? ''
  );
  const paymentStatus = getNested(responseData, [
    ['payment', 'status'],
    ['data', 'payment', 'status'],
    ['status'],
  ]);

  return { paymentURL, ntpID, paymentId, orderID, errorCode, errorMessage, paymentStatus };
}

function mapNetopiaStatusToInternal(status: unknown, code?: unknown): string {
  const webhookCode = code != null ? String(code) : '';
  if (webhookCode === '00' || webhookCode === '0') {
    return 'completed';
  }

  if (status === undefined || status === null || status === '') {
    return 'pending';
  }

  const statusStr = String(status).toLowerCase();
  const statusNum = Number(status);

  // Official v2 status codes (netopia-payment2 constants + OpenAPI NotifyRequest)
  switch (statusNum) {
    case STATUS.PAID: // 3
    case STATUS.CONFIRMED: // 5 — was incorrectly mapped to cancelled
      return 'completed';
    case STATUS.NEW: // 1
    case STATUS.OPENED: // 2
    case STATUS.PENDING: // 6
    case STATUS.SCHEDULED: // 7
    case STATUS.PENDING_AUTH: // 14
    case STATUS.AUTH_3D: // 15
      return 'processing';
    case STATUS.CANCELED: // 4
    case STATUS.REVERSED: // 17
    case STATUS.EXPIRED: // 23
      return 'cancelled';
    case STATUS.CREDIT: // 8
    case STATUS.CHARGEBACK_INIT: // 9
    case STATUS.CHARGEBACK_ACCEPT: // 10
    case STATUS.ERROR: // 11
    case STATUS.DECLINED: // 12
    case STATUS.FRAUD: // 13
      return 'failed';
  }

  switch (statusStr) {
    case 'confirmed':
    case 'completed':
    case 'success':
    case 'paid':
      return 'completed';
    case 'cancelled':
    case 'canceled':
    case 'cancel':
      return 'cancelled';
    case 'failed':
    case 'error':
    case 'rejected':
    case 'declined':
      return 'failed';
    case 'processing':
    case 'pending':
      return 'processing';
    default:
      return 'pending';
  }
}

function interpretNetopiaApiError(httpStatus: number, responseData: any, sandbox: boolean): {
  code: string;
  message: string;
} {
  const { errorCode, errorMessage } = extractPaymentFields(responseData);
  const raw = JSON.stringify(responseData || {}).toLowerCase();
  const msg = (errorMessage || '').toLowerCase();

  if (httpStatus === 401 || raw.includes('unauthorized') || msg.includes('api key') || msg.includes('authorization')) {
    return { code: 'INVALID_API_KEY', message: 'Invalid API Key.' };
  }

  if (
    raw.includes('possignature') ||
    raw.includes('pos signature') ||
    raw.includes('pos_signature') ||
    raw.includes('invalid signature') ||
    msg.includes('signature') ||
    errorCode === '48'
  ) {
    return { code: 'INVALID_POS_SIGNATURE', message: 'Invalid POS Signature.' };
  }

  if (
    (raw.includes('sandbox') && !sandbox) ||
    (raw.includes('live') && sandbox) ||
    msg.includes('environment')
  ) {
    return {
      code: 'ENVIRONMENT_MISMATCH',
      message: sandbox
        ? 'Live credentials appear to be used in Sandbox mode.'
        : 'Sandbox credentials are being used in Live mode.',
    };
  }

  if (
    raw.includes('not active') ||
    raw.includes('inactive') ||
    raw.includes('pos is not') ||
    msg.includes('not active') ||
    msg.includes('inactive pos')
  ) {
    return { code: 'POS_NOT_ACTIVE', message: 'The selected POS is not active.' };
  }

  if (errorMessage) {
    return { code: errorCode || 'NETOPIA_ERROR', message: errorMessage };
  }

  if (httpStatus === 401) {
    return { code: 'INVALID_API_KEY', message: 'Invalid API Key.' };
  }

  return {
    code: 'NETOPIA_ERROR',
    message: `Netopia request failed (HTTP ${httpStatus}). Check API Key, POS Signature and environment.`,
  };
}

async function verifyIpnJwt(opts: {
  verificationToken: string;
  rawBody: string;
  publicKeyPem: string;
  posSignature: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    let key: CryptoKey;
    const pem = opts.publicKeyPem.trim();
    if (pem.includes('BEGIN CERTIFICATE')) {
      key = await jose.importX509(pem, 'RS512');
    } else {
      key = await jose.importSPKI(pem, 'RS512');
    }

    const { payload } = await jose.jwtVerify(opts.verificationToken, key, {
      algorithms: ['RS512', 'RS256'],
    });

    if (payload.iss !== 'NETOPIA Payments') {
      return { ok: false, error: 'Invalid IPN token issuer.' };
    }

    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    if (aud && opts.posSignature && String(aud) !== opts.posSignature) {
      return { ok: false, error: 'IPN audience does not match POS Signature.' };
    }

    if (payload.sub) {
      const digest = await crypto.subtle.digest(
        'SHA-512',
        new TextEncoder().encode(opts.rawBody)
      );
      const bytes = new Uint8Array(digest);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const hashB64 = btoa(binary);
      const hashB64Url = hashB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const sub = String(payload.sub).replace(/=+$/, '');
      if (hashB64 !== payload.sub && hashB64Url !== sub) {
        return { ok: false, error: 'IPN payload hash mismatch.' };
      }
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'IPN JWT verification failed.',
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawBody = await req.text();
    let payload: any = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action } = payload;
    const verificationToken =
      req.headers.get('Verification-token') ||
      req.headers.get('verification-token') ||
      '';

    console.log('=== NETOPIA PAYMENT FUNCTION CALLED ===');
    console.log('Action field:', action || 'NOT PROVIDED');
    console.log('Has Verification-token:', !!verificationToken);

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
      console.log('DETECTED AS WEBHOOK');
      return await processWebhook(supabase, payload, {
        rawBody,
        verificationToken,
      });
    }

    const authHeader = req.headers.get('Authorization');
    let userId: string;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (user && !authError) {
        const { resolveActingOwnerId } = await import('../_shared/actingAs.ts');
        userId = await resolveActingOwnerId(
          supabase,
          user,
          token,
          payload.acting_as_user_id || null
        );
      } else if (payload.user_id) {
        userId = payload.user_id;
      } else {
        return new Response(
          JSON.stringify({ error: 'Invalid authentication' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (payload.user_id && action) {
      userId = payload.user_id;
    } else {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'create_payment') {
      return await createPayment(supabase, userId!, payload);
    } else if (action === 'payment_status') {
      return await getPaymentStatus(
        supabase,
        userId!,
        payload.payment_id || payload.order_id || payload.checkout_session_id
      );
    } else if (action === 'process_webhook') {
      return await processWebhook(supabase, payload, { rawBody, verificationToken });
    } else if (action === 'manual_update') {
      return await manualUpdatePayment(supabase, userId!, payload.order_id);
    } else if (action === 'test_connection') {
      return await testConnection(supabase, userId!, payload);
    } else {
      return new Response(
        JSON.stringify({ error: 'Unknown action', action }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: unknown) {
    console.error('ERROR in netopia-payment function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function loadNetopiaConfig(supabase: any, userId: string, overrides?: Partial<NetopiaConfig>) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('netpopia_api_key, netpopia_signature, netpopia_sandbox, netpopia_public_key')
    .eq('user_id', userId)
    .single();

  if (profileError) {
    return { error: 'Netopia configuration not found. Please configure your Netopia settings.' };
  }

  const api_key = (overrides?.api_key ?? profile?.netpopia_api_key ?? '').trim();
  const signature = (overrides?.signature ?? profile?.netpopia_signature ?? '').trim();
  const sandbox = overrides?.sandbox ?? profile?.netpopia_sandbox ?? true;
  const public_key = overrides?.public_key ?? profile?.netpopia_public_key ?? null;

  if (!api_key) {
    return { error: 'Missing API Key. Add it from Netopia Admin → Profile → Security.' };
  }
  if (!signature) {
    return { error: 'Missing POS Signature. Add it from Netopia Admin → Point of Sale → Technical Settings.' };
  }

  return {
    config: { api_key, signature, sandbox: !!sandbox, public_key } as NetopiaConfig,
  };
}

async function convertCheckoutSessionToOrder(
  supabase: any,
  sessionId: string,
  netopiaPaymentId?: string | null,
  providerResponse?: any
) {
  const { data, error } = await supabase.rpc('convert_checkout_session_to_order', {
    p_session_id: sessionId,
    p_netopia_payment_id: netopiaPaymentId || null,
    p_provider_response: providerResponse || null,
  });

  if (error) {
    console.error('convert_checkout_session_to_order RPC error:', error);
    return { success: false, error: error.message };
  }

  return data || { success: false, error: 'EMPTY_RPC_RESULT' };
}

async function maybeNotifyOrderPaid(supabase: any, conversion: any) {
  if (!conversion?.success || conversion.already_converted || !conversion.order_id) return;

  try {
    await supabase.functions.invoke('push-notification', {
      body: {
        action: 'send',
        user_ids: [conversion.user_id],
        title: '💳 Plată confirmată!',
        message: `Comandă plătită de ${parseFloat(conversion.total).toFixed(2)} RON de la ${conversion.customer_name}`,
        notification_type: 'order_update',
        data: {
          order_id: conversion.order_id,
          total: String(conversion.total),
          customer_name: conversion.customer_name,
        },
      },
    });
  } catch (pushError) {
    console.error('Failed to send push notification after conversion:', pushError);
  }
}

async function createPayment(supabase: any, userId: string, paymentData: NetopiaPaymentRequest) {
  try {
    const loaded = await loadNetopiaConfig(supabase, userId);
    if ('error' in loaded || !loaded.config) {
      return new Response(
        JSON.stringify({ error: loaded.error, code: 'MISSING_CREDENTIALS' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const netopiaConfig = loaded.config;

    const checkoutSessionId = paymentData.checkout_session_id || null;
    const legacyOrderId = paymentData.order_id || null;

    if (!checkoutSessionId && !legacyOrderId) {
      return new Response(
        JSON.stringify({ error: 'checkout_session_id or order_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prefer checkout session (new flow). Fall back to legacy order id for in-flight payments.
    let netopiaOrderId = '';
    let amount = paymentData.amount;
    let customerEmail = paymentData.customer_email;
    let customerName = paymentData.customer_name;
    let customerPhone = paymentData.customer_phone || '';

    if (checkoutSessionId) {
      const { data: session, error: sessionError } = await supabase
        .from('checkout_sessions')
        .select('*')
        .eq('id', checkoutSessionId)
        .eq('user_id', userId)
        .single();

      if (sessionError || !session) {
        return new Response(
          JSON.stringify({ error: 'Checkout session not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (session.status === 'expired' || new Date(session.expires_at) < new Date()) {
        await supabase
          .from('checkout_sessions')
          .update({ status: 'expired' })
          .eq('id', session.id)
          .eq('status', 'pending');
        return new Response(
          JSON.stringify({ error: 'Checkout session expired. Please place the order again.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (session.netopia_payment_url) {
        return new Response(
          JSON.stringify({
            success: true,
            payment_url: session.netopia_payment_url,
            payment_id: session.netopia_payment_id,
            checkout_session_id: session.id,
            reused: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      netopiaOrderId = session.id;
      amount = Number(session.total);
      customerEmail = session.customer_email;
      customerName = session.customer_name;
      customerPhone = session.customer_phone || '';
    } else {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', legacyOrderId)
        .eq('user_id', userId)
        .single();

      if (orderError || !order) {
        return new Response(
          JSON.stringify({ error: 'Order not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      netopiaOrderId = order.id;
      amount = paymentData.amount ?? Number(order.total);
      customerEmail = paymentData.customer_email || order.customer_email;
      customerName = paymentData.customer_name || order.customer_name;
      customerPhone = paymentData.customer_phone || order.customer_phone || '';
    }

    const netopiaUrl = `${getNetopiaBaseUrl(netopiaConfig.sandbox)}/payment/card/start`;

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
        description: paymentData.description || `Payment ${netopiaOrderId}`,
        orderID: netopiaOrderId,
        amount,
        currency: paymentData.currency || 'RON',
        billing: {
          email: customerEmail,
          phone: customerPhone,
          firstName: customerName.split(' ')[0] || '',
          lastName: customerName.split(' ').slice(1).join(' ') || customerName.split(' ')[0] || '',
          city: '',
          country: 642,
          countryName: 'Romania',
          state: '',
          postalCode: '',
          details: ''
        }
      }
    };

    console.log('Creating Netopia payment request to:', netopiaUrl, 'orderID:', netopiaOrderId);

    const netopiaResponse = await fetch(netopiaUrl, {
      method: 'POST',
      headers: {
        'Authorization': netopiaConfig.api_key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentRequest)
    });

    const responseData = await netopiaResponse.json().catch(() => ({}));
    console.log('Netopia response status:', netopiaResponse.status);

    const extracted = extractPaymentFields(responseData);
    const isRedirectSuccess =
      netopiaResponse.ok ||
      extracted.errorCode === '101' ||
      !!extracted.paymentURL;

    if (!isRedirectSuccess || (!extracted.paymentURL && !netopiaResponse.ok)) {
      const interpreted = interpretNetopiaApiError(
        netopiaResponse.status,
        responseData,
        netopiaConfig.sandbox
      );
      console.error('Netopia payment creation failed:', interpreted);

      await supabase.from('payment_transactions').insert({
        user_id: userId,
        order_id: legacyOrderId || null,
        checkout_session_id: checkoutSessionId || null,
        payment_provider: 'netopia',
        payment_status: 'failed',
        amount,
        currency: paymentData.currency || 'RON',
        provider_response: responseData,
        error_message: interpreted.message
      });

      return new Response(
        JSON.stringify({
          error: 'Payment creation failed',
          details: interpreted.message,
          code: interpreted.code,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: transaction, error: transactionError } = await supabase
      .from('payment_transactions')
      .insert({
        user_id: userId,
        order_id: legacyOrderId || null,
        checkout_session_id: checkoutSessionId || null,
        payment_provider: 'netopia',
        payment_status: 'pending',
        amount,
        currency: paymentData.currency || 'RON',
        payment_method: 'card',
        netopia_payment_id: extracted.ntpID,
        netopia_order_id: extracted.orderID || netopiaOrderId,
        provider_response: responseData
      })
      .select()
      .single();

    if (transactionError) {
      console.error('Failed to store transaction:', transactionError);
    }

    if (checkoutSessionId && extracted.paymentURL) {
      await supabase
        .from('checkout_sessions')
        .update({
          netopia_payment_id: extracted.ntpID,
          netopia_payment_url: extracted.paymentURL,
          provider_response: responseData,
        })
        .eq('id', checkoutSessionId);
    }

    if (!extracted.paymentURL) {
      return new Response(
        JSON.stringify({
          error: 'Payment created but no payment URL was returned by Netopia.',
          code: 'MISSING_PAYMENT_URL',
          details: extracted.errorMessage || null,
          payment_id: extracted.paymentId || extracted.ntpID,
          transaction_id: transaction?.id
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: extracted.paymentURL,
        payment_id: extracted.paymentId || extracted.ntpID,
        transaction_id: transaction?.id,
        checkout_session_id: checkoutSessionId || null,
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

async function syncStatusFromNetopia(
  supabase: any,
  transaction: any,
  netopiaConfig: NetopiaConfig
): Promise<{ payment_status: string; provider_details: any; synced: boolean }> {
  if (!transaction.netopia_payment_id) {
    return {
      payment_status: transaction.payment_status || 'pending',
      provider_details: transaction.provider_response || {},
      synced: false,
    };
  }

  const statusUrl = `${getNetopiaBaseUrl(netopiaConfig.sandbox)}/operation/status`;
  // Official JS SDK sends posID = POS Signature
  const statusBody = {
    posID: netopiaConfig.signature,
    ntpID: transaction.netopia_payment_id,
  };

  console.log('Calling Netopia status API:', statusUrl, statusBody);

  const statusResponse = await fetch(statusUrl, {
    method: 'POST',
    headers: {
      'Authorization': netopiaConfig.api_key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(statusBody),
  });

  const statusData = await statusResponse.json().catch(() => ({}));
  console.log('Netopia status response:', statusResponse.status, JSON.stringify(statusData));

  if (!statusResponse.ok) {
    return {
      payment_status: transaction.payment_status || 'pending',
      provider_details: { local: transaction.provider_response, status_error: statusData },
      synced: false,
    };
  }

  const paymentStatusRaw = getNested(statusData, [
    ['payment', 'status'],
    ['data', 'payment', 'status'],
  ]);
  const errorCode = getNested(statusData, [
    ['error', 'code'],
    ['data', 'error', 'code'],
  ]);

  const newStatus = mapNetopiaStatusToInternal(paymentStatusRaw, errorCode);

  if (newStatus !== transaction.payment_status) {
    await supabase
      .from('payment_transactions')
      .update({
        payment_status: newStatus,
        provider_response: statusData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    if (newStatus === 'completed') {
      if (transaction.checkout_session_id) {
        const conversion = await convertCheckoutSessionToOrder(
          supabase,
          transaction.checkout_session_id,
          transaction.netopia_payment_id,
          statusData
        );
        await maybeNotifyOrderPaid(supabase, conversion);
      } else if (transaction.order_id) {
        // Legacy path: order already existed before payment
        await supabase
          .from('orders')
          .update({
            payment_status: 'paid',
            order_status: 'paid',
          })
          .eq('id', transaction.order_id);
      }
    }
  }

  return {
    payment_status: newStatus,
    provider_details: statusData,
    synced: true,
  };
}

async function getPaymentStatus(supabase: any, userId: string, paymentId: string) {
  try {
    console.log('Getting payment status for:', paymentId, 'user:', userId);

    let transaction = null;
    let checkoutSession = null;

    if (paymentId) {
      // New flow: paymentId may be a checkout_session_id
      const { data: sessionById } = await supabase
        .from('checkout_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('id', paymentId)
        .maybeSingle();

      if (sessionById) {
        checkoutSession = sessionById;
        const { data: txBySession } = await supabase
          .from('payment_transactions')
          .select('*')
          .eq('user_id', userId)
          .eq('checkout_session_id', sessionById.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        transaction = txBySession;
      }

      if (!transaction) {
        const { data: txByPaymentId } = await supabase
          .from('payment_transactions')
          .select('*')
          .eq('user_id', userId)
          .eq('netopia_payment_id', paymentId)
          .maybeSingle();

        if (txByPaymentId) {
          transaction = txByPaymentId;
        } else {
          const { data: txById } = await supabase
            .from('payment_transactions')
            .select('*')
            .eq('user_id', userId)
            .eq('id', paymentId)
            .maybeSingle();

          if (txById) {
            transaction = txById;
          } else {
            const { data: txByOrder } = await supabase
              .from('payment_transactions')
              .select('*')
              .eq('user_id', userId)
              .eq('order_id', paymentId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            transaction = txByOrder;
          }
        }
      }
    }

    if (!transaction && !checkoutSession) {
      return new Response(
        JSON.stringify({
          error: 'Transaction not found',
          details: 'No transaction found for the given criteria'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Session already converted
    if (checkoutSession?.order_id || checkoutSession?.status === 'converted') {
      return new Response(
        JSON.stringify({
          payment_status: 'completed',
          checkout_session_id: checkoutSession.id,
          order_id: checkoutSession.order_id,
          amount: checkoutSession.total,
          currency: 'RON',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let paymentStatus = transaction?.payment_status || checkoutSession?.payment_status || 'pending';
    let providerDetails = transaction?.provider_response || checkoutSession?.provider_response || {};
    let synced = false;
    let orderId = transaction?.order_id || checkoutSession?.order_id || null;

    if (paymentStatus !== 'completed' && paymentStatus !== 'cancelled' && paymentStatus !== 'failed') {
      const loaded = await loadNetopiaConfig(supabase, userId);
      if ('config' in loaded && loaded.config && transaction) {
        try {
          const sync = await syncStatusFromNetopia(supabase, transaction, loaded.config);
          paymentStatus = sync.payment_status;
          providerDetails = sync.provider_details;
          synced = sync.synced;

          if (paymentStatus === 'completed' && transaction.checkout_session_id) {
            const { data: refreshed } = await supabase
              .from('checkout_sessions')
              .select('order_id, status')
              .eq('id', transaction.checkout_session_id)
              .maybeSingle();
            orderId = refreshed?.order_id || orderId;
          }
        } catch (e) {
          console.error('Status sync failed, returning local status:', e);
        }
      }
    }

    return new Response(
      JSON.stringify({
        transaction_id: transaction?.id || null,
        payment_status: paymentStatus,
        amount: transaction?.amount ?? checkoutSession?.total,
        currency: transaction?.currency || 'RON',
        created_at: transaction?.created_at || checkoutSession?.created_at,
        provider_details: providerDetails,
        synced_from_netopia: synced,
        checkout_session_id: transaction?.checkout_session_id || checkoutSession?.id || null,
        order_id: orderId,
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

async function processWebhook(
  supabase: any,
  webhookData: any,
  opts?: { rawBody?: string; verificationToken?: string }
) {
  try {
    console.log('PROCESSING NETOPIA WEBHOOK');
    console.log('Webhook data:', JSON.stringify(webhookData, null, 2));

    const paymentId = webhookData.paymentId ||
                     webhookData.payment_id ||
                     webhookData.ntpID ||
                     webhookData.payment?.ntpID;

    const orderId = webhookData.orderID ||
                   webhookData.order_id ||
                   webhookData.orderId ||
                   webhookData.order?.orderID;

    console.log('Payment ID (ntpID):', paymentId || 'NOT FOUND');
    console.log('Order ID:', orderId || 'NOT FOUND');

    let transaction = null;
    let checkoutSessionId: string | null = null;

    if (paymentId) {
      const { data: txByPaymentId } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('netopia_payment_id', paymentId)
        .maybeSingle();
      if (txByPaymentId) transaction = txByPaymentId;
    }

    if (!transaction && orderId) {
      const { data: txByOrderId } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('netopia_order_id', orderId)
        .maybeSingle();
      if (txByOrderId) transaction = txByOrderId;

      if (!transaction) {
        const { data: txByOrderPk } = await supabase
          .from('payment_transactions')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (txByOrderPk) transaction = txByOrderPk;
      }

      // New flow: Netopia orderID is the checkout_session.id
      if (!transaction) {
        const { data: session } = await supabase
          .from('checkout_sessions')
          .select('*')
          .eq('id', orderId)
          .maybeSingle();
        if (session) {
          checkoutSessionId = session.id;
          const { data: txBySession } = await supabase
            .from('payment_transactions')
            .select('*')
            .eq('checkout_session_id', session.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          transaction = txBySession;
        }
      }
    }

    if (transaction?.checkout_session_id) {
      checkoutSessionId = transaction.checkout_session_id;
    }

    if (!transaction && !checkoutSessionId) {
      console.error('TRANSACTION NOT FOUND');
      return new Response('Transaction not found but OK', { status: 200, headers: corsHeaders });
    }

    const ownerUserId = transaction?.user_id;
    // Optional official IPN JWT verification when merchant configured a public key
    if (ownerUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('netpopia_public_key, netpopia_signature')
        .eq('user_id', ownerUserId)
        .maybeSingle();

      if (profile?.netpopia_public_key && opts?.verificationToken && opts?.rawBody) {
        const verify = await verifyIpnJwt({
          verificationToken: opts.verificationToken,
          rawBody: opts.rawBody,
          publicKeyPem: profile.netpopia_public_key,
          posSignature: profile.netpopia_signature || '',
        });
        if (!verify.ok) {
          console.error('IPN JWT verification failed:', verify.error);
          return new Response(
            JSON.stringify({ error: 'IPN verification failed', details: verify.error }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log('IPN JWT verified successfully');
      } else if (profile?.netpopia_public_key && !opts?.verificationToken) {
        console.warn('Public key configured but Verification-token header missing; processing without JWT verify (backwards compatible)');
      }
    }

    const webhookStatus = webhookData.status ||
                         webhookData.payment?.status ||
                         webhookData.orderStatus ||
                         webhookData.paymentStatus;
    const webhookCode = webhookData.code || webhookData.payment?.code || webhookData.error?.code;
    const newStatus = mapNetopiaStatusToInternal(webhookStatus, webhookCode);

    console.log('Mapped status:', webhookStatus, webhookCode, '→', newStatus);

    if (transaction) {
      await supabase
        .from('payment_transactions')
        .update({
          payment_status: newStatus,
          provider_response: webhookData,
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);
    }

    if (newStatus === 'completed') {
      if (checkoutSessionId) {
        const conversion = await convertCheckoutSessionToOrder(
          supabase,
          checkoutSessionId,
          paymentId,
          webhookData
        );
        console.log('Checkout session conversion result:', conversion);
        await maybeNotifyOrderPaid(supabase, conversion);
      } else if (transaction?.order_id) {
        // Legacy path: order already existed
        const { data: order } = await supabase
          .from('orders')
          .select('id, user_id, customer_name, total')
          .eq('id', transaction.order_id)
          .single();

        await supabase
          .from('orders')
          .update({
            payment_status: 'paid',
            order_status: 'paid'
          })
          .eq('id', transaction.order_id);

        if (order) {
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
          } catch (pushError) {
            console.error('Failed to send push notification:', pushError);
          }
        }
      }
    }

    return new Response('OK', {
      status: 200,
      headers: corsHeaders
    });
  } catch (error) {
    console.error('ERROR PROCESSING WEBHOOK:', error);
    return new Response('Error logged but returning OK', {
      status: 200,
      headers: corsHeaders
    });
  }
}

async function testConnection(supabase: any, userId: string, payload: any) {
  try {
    const overrides: Partial<NetopiaConfig> = {};
    if (payload.api_key !== undefined) overrides.api_key = payload.api_key;
    if (payload.signature !== undefined) overrides.signature = payload.signature;
    if (payload.sandbox !== undefined) overrides.sandbox = payload.sandbox;
    if (payload.public_key !== undefined) overrides.public_key = payload.public_key;

    const loaded = await loadNetopiaConfig(supabase, userId, overrides);
    if ('error' in loaded || !loaded.config) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'MISSING_CREDENTIALS',
          error: loaded.error,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = loaded.config;
    const baseUrl = getNetopiaBaseUrl(config.sandbox);
    const startUrl = `${baseUrl}/payment/card/start`;

    // Official OpenAPI: amount 0 = account verification
    const testOrderId = `conn-test-${userId.slice(0, 8)}-${Date.now()}`;
    const verificationRequest = {
      config: {
        emailTemplate: null,
        notifyUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/netopia-payment`,
        redirectUrl: 'https://netopia-payments.com',
        language: 'ro',
      },
      payment: {
        options: { installments: 0, bonus: 0 },
        instrument: { type: 'card' },
        data: {},
      },
      order: {
        posSignature: config.signature,
        dateTime: new Date().toISOString(),
        description: 'Connection test',
        orderID: testOrderId,
        amount: 0,
        currency: 'RON',
        billing: {
          email: 'connection-test@example.com',
          phone: '0700000000',
          firstName: 'Connection',
          lastName: 'Test',
          city: 'Bucharest',
          country: 642,
          countryName: 'Romania',
          state: 'Bucharest',
          postalCode: '010000',
          details: '',
        },
      },
    };

    const response = await fetch(startUrl, {
      method: 'POST',
      headers: {
        'Authorization': config.api_key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(verificationRequest),
    });

    const responseData = await response.json().catch(() => ({}));
    const extracted = extractPaymentFields(responseData);
    console.log('Connection test response:', response.status, JSON.stringify(responseData));

    // Treat as success if credentials accepted (HTTP 200, redirect 101, or paymentURL present)
    const accepted =
      response.ok ||
      extracted.errorCode === '101' ||
      extracted.errorCode === '00' ||
      extracted.errorCode === '0' ||
      !!extracted.paymentURL;

    if (!accepted) {
      const interpreted = interpretNetopiaApiError(response.status, responseData, config.sandbox);
      return new Response(
        JSON.stringify({
          success: false,
          code: interpreted.code,
          error: interpreted.message,
          environment: config.sandbox ? 'sandbox' : 'live',
          endpoint: startUrl,
          details: responseData,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Netopia connection successful (${config.sandbox ? 'Sandbox' : 'Live'}). API Key and POS Signature were accepted.`,
        environment: config.sandbox ? 'sandbox' : 'live',
        endpoint: startUrl,
        public_key_configured: !!config.public_key,
        ntpID: extracted.ntpID || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        code: 'CONNECTION_ERROR',
        error: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function manualUpdatePayment(supabase: any, userId: string, orderId: string) {
  try {
    console.log('Manual update payment status for order:', orderId, 'user:', userId);

    const { data: transaction, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !transaction) {
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

      return new Response(
        JSON.stringify({ success: true, message: 'Order marked as paid' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabase
      .from('payment_transactions')
      .update({
        payment_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id);

    await supabase
      .from('orders')
      .update({ payment_status: 'paid' })
      .eq('id', orderId);

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
