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
  seriesName: string
): Promise<any> {
  console.log('Creating Oblio invoice for order:', order.id);

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

async function sendOblioInvoice(accessToken: string, cif: string, seriesName: string, number: string): Promise<any> {
  console.log('Sending Oblio invoice via email...');

  const response = await fetch(`https://www.oblio.eu/api/docs/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      cif: cif,
      seriesName: seriesName,
      number: number,
      type: "Factura"
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Oblio invoice send failed:', errorText);
    throw new Error(`Failed to send invoice: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('Invoice sent successfully:', result);
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
      await supabase
        .from('orders')
        .update({
          payment_status: 'invoiced',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

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
      // For sending, we need to get the latest invoice number for this series
      // Since the invoice was already generated, we'll get the latest invoice number
      
      // Get the latest invoice from Oblio for this series
      let latestInvoiceNumber;
      try {
        const invoicesResponse = await fetch(`https://www.oblio.eu/api/docs/invoice?cif=${cif}&seriesName=${profile.oblio_series_name}&limit=1`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (invoicesResponse.ok) {
          const invoicesData = await invoicesResponse.json();
          if (invoicesData.data && invoicesData.data.length > 0) {
            latestInvoiceNumber = invoicesData.data[0].number;
          }
        }
      } catch (error) {
        console.log('Could not fetch latest invoice, will try to create new one');
      }

      // If we don't have an invoice number, try to create one
      if (!latestInvoiceNumber) {
        try {
          const invoiceResult = await createOblioInvoice(
            accessToken,
            cif,
            order as OrderWithItems,
            profile.oblio_series_name
          );
          if (invoiceResult && invoiceResult.data) {
            latestInvoiceNumber = invoiceResult.data.number;
          }
        } catch (error) {
          console.error('Failed to create invoice for sending:', error);
          throw new Error('Could not create or find invoice to send');
        }
      }

      // Send invoice via email
      if (latestInvoiceNumber) {
        await sendOblioInvoice(
          accessToken,
          cif,
          profile.oblio_series_name,
          latestInvoiceNumber
        );
      } else {
        throw new Error('No invoice number available to send');
      }

      // Update order status
      await supabase
        .from('orders')
        .update({
          payment_status: 'invoiced',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Invoice sent successfully to customer'
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