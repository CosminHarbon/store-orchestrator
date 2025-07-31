import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

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
}

interface OrderWithItems {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_address: string;
  customer_phone: string;
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

  const invoiceData = {
    cif: cif,
    client: {
      name: order.customer_name,
      email: order.customer_email,
      address: order.customer_address,
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
    invoiceData.sendEmail = 1;
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
    throw new Error(`Oblio invoice creation failed: ${response.status} - ${errorText}`);
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

    const { orderId, action }: OblioInvoiceRequest = await req.json();

    // Get user's Oblio configuration
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('oblio_email, oblio_api_key, oblio_series_name')
      .eq('user_id', user.id)
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
      .eq('user_id', user.id)
      .single();

    if (orderError || !order) {
      throw new Error('Order not found');
    }

    // Get Oblio access token
    const accessToken = await getOblioAccessToken(profile.oblio_email, profile.oblio_api_key);
    
    // Get company CIF
    const cif = await getOblioCompanyCIF(accessToken);

    if (action === 'generate') {
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
        .eq('user_id', user.id);

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
        .eq('user_id', user.id);

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
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
};

serve(handler);