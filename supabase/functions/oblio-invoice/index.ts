import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { resolveActingOwnerId } from '../_shared/actingAs.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OblioTokenResponse {
  access_token: string;
  expires_in: string;
  token_type: string;
  scope: string;
  request_time: string;
}

interface OblioInvoiceRequest {
  orderId: string;
  action: 'generate' | 'send';
  acting_as_user_id?: string;
}

interface OrderWithItems {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_address: string;
  customer_phone: string;
  billing_address?: string | null;
  billing_city?: string | null;
  billing_county?: string | null;
  billing_street?: string | null;
  billing_street_number?: string | null;
  billing_block?: string | null;
  billing_apartment?: string | null;
  customer_city?: string | null;
  customer_county?: string | null;
  total: number;
  created_at: string;
  order_items: Array<{
    product_title: string;
    product_price: number;
    quantity: number;
  }>;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

class OblioApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'OblioApiError';
    this.status = status;
  }
}

function parseOblioErrorMessage(errorText: string, status: number): string {
  try {
    const parsed = JSON.parse(errorText);
    const msg = parsed?.statusMessage || parsed?.message || parsed?.error;
    if (msg) return String(msg).replace(/\r\n/g, ' ').trim();
  } catch {
    /* not JSON */
  }
  const trimmed = (errorText || '').replace(/\r\n/g, ' ').trim();
  return trimmed || `Oblio invoice creation failed (${status})`;
}

async function getOblioAccessToken(email: string, secretKey: string): Promise<string> {
  console.log('Getting Oblio access token...');
  
  const response = await fetch('https://www.oblio.eu/api/authorize/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `client_id=${encodeURIComponent(email)}&client_secret=${encodeURIComponent(secretKey)}`,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Oblio auth failed:', errorText);
    throw new Error(`Oblio authentication failed: ${response.status}`);
  }

  const data: OblioTokenResponse = await response.json();
  console.log('Oblio access token obtained successfully');
  return data.access_token;
}

async function getOblioCompanyCIF(accessToken: string): Promise<string> {
  console.log('Getting company CIF from Oblio...');
  
  const response = await fetch('https://www.oblio.eu/api/nomenclature/companies', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get company info: ${response.status}`);
  }

  const data = await response.json();
  if (!data.data || data.data.length === 0) {
    throw new Error('No companies found in Oblio account');
  }

  const cif = data.data[0].cif;
  console.log('Company CIF obtained:', cif);
  return cif;
}

async function createOblioInvoice(
  accessToken: string,
  cif: string,
  order: OrderWithItems,
  seriesName: string,
  sendEmail: boolean = false
): Promise<any> {
  console.log('Creating Oblio invoice for order:', order.id, sendEmail ? '(with email)' : '(without email)');

  // Prepare products array with VAT included
  const products = order.order_items.map(item => ({
    name: item.product_title,
    price: item.product_price,
    quantity: item.quantity,
    measuringUnit: "buc",
    vatName: "Normala",
    vatPercentage: 19,
    vatIncluded: 1, // VAT is included in the price
    productType: "Serviciu"
  }));

  const billingAddress = [
    order.billing_street,
    order.billing_street_number,
    order.billing_block ? `bl. ${order.billing_block}` : '',
    order.billing_apartment ? `ap. ${order.billing_apartment}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  const invoiceAddress =
    order.billing_address ||
    (billingAddress
      ? `${billingAddress}, ${[order.billing_city, order.billing_county].filter(Boolean).join(', ')}`
      : order.customer_address);
  const invoiceCity = order.billing_city || order.customer_city || '';
  const invoiceCounty = order.billing_county || order.customer_county || '';

  const invoiceData = {
    cif: cif,
    client: {
      name: order.customer_name,
      email: order.customer_email,
      address: invoiceAddress,
      city: invoiceCity,
      state: invoiceCounty,
      country: 'Romania',
      phone: order.customer_phone || "",
      vatPayer: false,
      save: 1,
      autocomplete: 0
    },
    issueDate: new Date(order.created_at).toISOString().split('T')[0],
    seriesName: seriesName,
    language: "RO",
    precision: 2,
    currency: "RON",
    products: products,
    workStation: "Sediu"
  };

  // Only add sendEmail parameter if we want to send email
  if (sendEmail) {
    (invoiceData as any).sendEmail = 1;
  }

  console.log('Invoice data prepared:', JSON.stringify(invoiceData, null, 2));

  const response = await fetch('https://www.oblio.eu/api/docs/invoice', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(invoiceData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Oblio invoice creation failed:', errorText);
    throw new OblioApiError(response.status, parseOblioErrorMessage(errorText, response.status));
  }

  const result = await response.json();
  console.log('Oblio invoice created successfully:', result);
  return result;
}


const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // GET proxy: stream the Oblio invoice through our domain so browser
    // ad blockers (uBlock/AdGuard) that block oblio.eu cannot break "View Invoice".
    // URL: /oblio-invoice?orderId=xxx  (auth via Authorization header or ?token=)
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const orderId = url.searchParams.get('orderId');
      const tokenParam = url.searchParams.get('token');
      const authHeader = req.headers.get('authorization');
      const jwt = tokenParam || (authHeader ? authHeader.replace('Bearer ', '') : '');
      if (!orderId || !jwt) {
        return new Response('Missing orderId or token', { status: 400, headers: corsHeaders });
      }
      const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
      if (authErr || !user) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders });
      }
      const actingAs = url.searchParams.get('acting_as_user_id');
      let ownerId = user.id;
      try {
        ownerId = await resolveActingOwnerId(supabase, user, jwt, actingAs);
      } catch {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders });
      }
      const { data: ord, error: ordErr } = await supabase
        .from('orders')
        .select('invoice_link')
        .eq('id', orderId)
        .eq('user_id', ownerId)
        .single();
      if (ordErr || !ord?.invoice_link) {
        return new Response('Invoice not found', { status: 404, headers: corsHeaders });
      }
      const upstream = await fetch(ord.invoice_link, { redirect: 'follow' });
      const headers = new Headers(corsHeaders);
      const ct = upstream.headers.get('content-type');
      if (ct) headers.set('content-type', ct);
      headers.set('content-disposition', 'inline');
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    // Get user from JWT token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    
    if (authError || !user) {
      throw new Error('Invalid authentication');
    }

    const { orderId, action, acting_as_user_id }: OblioInvoiceRequest = await req.json();
    const ownerId = await resolveActingOwnerId(supabase, user, jwt, acting_as_user_id);

    // Get user's Oblio configuration
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('oblio_email, oblio_api_key, oblio_series_name')
      .eq('user_id', ownerId)
      .single();

    if (profileError || !profile) {
      throw new Error('Profile not found');
    }

    if (!profile.oblio_email || !profile.oblio_api_key || !profile.oblio_series_name) {
      throw new Error('Oblio configuration incomplete. Please configure your Oblio Email, API Key, and Series Name in Store Settings first.');
    }

    // Get order details with items
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          product_title,
          product_price,
          quantity
        )
      `)
      .eq('id', orderId)
      .eq('user_id', ownerId)
      .single();

    if (orderError || !order) {
      throw new Error('Order not found');
    }

    // Check if order has any items
    if (!order.order_items || order.order_items.length === 0) {
      throw new Error('Cannot create invoice: Order has no items. Please ensure the order contains products before generating an invoice.');
    }

    // Get Oblio access token
    const accessToken = await getOblioAccessToken(profile.oblio_email, profile.oblio_api_key);
    
    // Get company CIF
    const cif = await getOblioCompanyCIF(accessToken);

    if (action === 'generate') {
      // Idempotency: if an invoice already exists for this order, return it instead of creating a duplicate
      if (order.invoice_number && order.invoice_series) {
        console.log('Invoice already exists for order, skipping creation:', order.id);
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Invoice already generated for this order',
            invoice: {
              data: {
                number: order.invoice_number,
                seriesName: order.invoice_series,
                link: order.invoice_link,
              },
            },
            alreadyExists: true,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
        );
      }

      // Create invoice
      const invoiceResult = await createOblioInvoice(
        accessToken,
        cif,
        order as OrderWithItems,
        profile.oblio_series_name
      );

      // Update order with invoice details
      console.log('Updating order with invoice details:', {
        orderId,
        invoice_number: invoiceResult.data.number,
        invoice_series: invoiceResult.data.seriesName,
        invoice_link: invoiceResult.data.link
      });
      
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          invoice_number: invoiceResult.data.number,
          invoice_series: invoiceResult.data.seriesName,
          invoice_link: invoiceResult.data.link,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .eq('user_id', ownerId);

      if (updateError) {
        console.error('Error updating order:', updateError);
        throw new Error(`Failed to update order: ${updateError.message}`);
      }
      
      console.log('Order updated successfully');

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Invoice generated successfully',
          invoice: invoiceResult
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );

    } else if (action === 'send') {
      // Check if invoice already exists for this order
      if (order.invoice_number && order.invoice_series) {
        // Invoice already exists - provide helpful message
        return new Response(
          JSON.stringify({
            success: false,
            error: 'An invoice has already been generated for this order. You can view it using the "View Invoice" button. Note: Oblio API does not support sending existing invoices via email - you can only send emails during invoice creation.'
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }

      // No existing invoice, create and send a new one
      console.log(`Creating and sending invoice via email for order ${order.id}`);

      // Create invoice with email sending enabled
      const invoiceResult = await createOblioInvoice(
        accessToken,
        cif,
        order as OrderWithItems,
        profile.oblio_series_name,
        true  // sendEmail = true
      );

      // Update order with invoice details
      console.log('Updating order with invoice details (send action):', {
        orderId,
        invoice_number: invoiceResult.data.number,
        invoice_series: invoiceResult.data.seriesName,
        invoice_link: invoiceResult.data.link
      });
      
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          invoice_number: invoiceResult.data.number,
          invoice_series: invoiceResult.data.seriesName,
          invoice_link: invoiceResult.data.link,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .eq('user_id', ownerId);

      if (updateError) {
        console.error('Error updating order (send action):', updateError);
        throw new Error(`Failed to update order: ${updateError.message}`);
      }
      
      console.log('Order updated successfully (send action)');

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Invoice created and sent successfully to customer via email',
          invoice: invoiceResult
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    } else {
      throw new Error('Invalid action. Use "generate" or "send"');
    }

  } catch (error: any) {
    console.error('Error in oblio-invoice function:', error);
    const isOblio = error instanceof OblioApiError;
    const status = isOblio && error.status >= 400 && error.status < 500 ? 400 : 500;

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }),
      {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
};

serve(handler);