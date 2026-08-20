import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  buildOriginAddress,
  calculateDeliveryQuote,
  roundMoney,
  sanitizeCustomerNotes,
} from '../_shared/geoDelivery.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          user_id: string
          store_name: string | null
          store_api_key: string
          cash_payment_enabled: boolean | null
          cash_payment_fee: number | null
          home_delivery_fee: number | null
          locker_delivery_fee: number | null
          created_at: string
          updated_at: string
        }
      }
      products: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          price: number
          stock: number
          sku: string | null
          category: string | null
          image: string | null
          low_stock_threshold: number
          created_at: string
          updated_at: string
        }
      }
      product_images: {
        Row: {
          id: string
          product_id: string
          image_url: string
          is_primary: boolean
          display_order: number
          created_at: string
          updated_at: string
        }
      }
      discounts: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          discount_type: 'percentage' | 'fixed_amount'
          discount_value: number
          start_date: string
          end_date: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
      }
      product_discounts: {
        Row: {
          id: string
          product_id: string
          discount_id: string
          created_at: string
        }
      }
      orders: {
        Row: {
          id: string
          user_id: string
          customer_name: string
          customer_email: string
          customer_address: string
          customer_phone: string | null
          customer_city: string | null
          customer_county: string | null
          customer_street: string | null
          customer_street_number: string | null
          customer_block: string | null
          customer_apartment: string | null
          billing_same_as_delivery?: boolean
          billing_address?: string | null
          billing_city?: string | null
          billing_county?: string | null
          billing_street?: string | null
          billing_street_number?: string | null
          billing_block?: string | null
          billing_apartment?: string | null
          total: number
          payment_status: string
          shipping_status: string
          order_status: string | null
          delivery_type: string | null
          selected_carrier_code: string | null
          locker_id: string | null
          locker_name: string | null
          locker_address: string | null
          awb_number: string | null
          carrier_name: string | null
          tracking_url: string | null
          invoice_number: string | null
          invoice_series: string | null
          invoice_link: string | null
          eawb_order_id: number | null
          estimated_delivery_date: string | null
          created_at: string
          updated_at: string
        }
      }
      carriers: {
        Row: {
          id: number
          code: string
          name: string
          api_base_url: string
          is_active: boolean
          logo_url: string | null
          created_at: string
          updated_at: string
        }
      }
      carrier_services: {
        Row: {
          id: number
          carrier_id: number
          service_code: string
          name: string
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
      }
      collections: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          image_url: string | null
          created_at: string
          updated_at: string
        }
      }
      product_collections: {
        Row: {
          id: string
          product_id: string
          collection_id: string
          created_at: string
        }
      }
    }
  }
}

// Discount calculation function
function calculateProductPrice(
  productId: string,
  originalPrice: number,
  discounts: any[],
  productDiscounts: any[]
) {
  // Find active discounts for this product
  const productDiscountIds = productDiscounts
    .filter(pd => pd.product_id === productId)
    .map(pd => pd.discount_id);

  if (productDiscountIds.length === 0) {
    return {
      originalPrice,
      discountedPrice: null,
      hasDiscount: false
    };
  }

  // Find the best (highest discount) active discount
  const activeDiscounts = discounts.filter(discount => {
    const isInList = productDiscountIds.includes(discount.id);
    const isActive = discount.is_active;
    const isInDateRange = new Date(discount.start_date) <= new Date() && 
      (!discount.end_date || new Date(discount.end_date) >= new Date());
    
    return isInList && isActive && isInDateRange;
  });

  if (activeDiscounts.length === 0) {
    return {
      originalPrice,
      discountedPrice: null,
      hasDiscount: false
    };
  }

  // Calculate discount amounts and find the best one
  let bestDiscount = 0;
  let bestDiscountType: 'percentage' | 'fixed_amount' = 'percentage';

  activeDiscounts.forEach(discount => {
    let discountAmount = 0;
    
    if (discount.discount_type === 'percentage') {
      discountAmount = originalPrice * (discount.discount_value / 100);
    } else {
      discountAmount = Math.min(discount.discount_value, originalPrice);
    }

    if (discountAmount > bestDiscount) {
      bestDiscount = discountAmount;
      bestDiscountType = discount.discount_type;
    }
  });

  const discountedPrice = Math.max(0, originalPrice - bestDiscount);
  const discountPercentage = (bestDiscount / originalPrice) * 100;

  return {
    originalPrice,
    discountedPrice,
    hasDiscount: true,
    discountPercentage,
    savingsAmount: bestDiscount
  };
}

/** Mark active abandoned cart as converted. Never throws — Place Order must not fail because of this. */
async function convertAbandonedCart(
  supabase: any,
  userId: string,
  sessionToken: string | null | undefined,
  links: { checkout_session_id?: string | null; order_id?: string | null } = {}
) {
  if (!sessionToken || typeof sessionToken !== 'string') return;
  try {
    await supabase
      .from('abandoned_carts')
      .update({
        status: 'converted',
        converted_at: new Date().toISOString(),
        converted_checkout_session_id: links.checkout_session_id || null,
        converted_order_id: links.order_id || null,
        last_activity_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('session_token', sessionToken)
      .eq('status', 'active');
  } catch (e) {
    console.warn('Abandoned cart convert warning:', e);
  }
}

async function loadCustomDelivery(supabase: any, userId: string) {
  const [{ data: settings }, { data: rules }, { data: orderValueRules }] = await Promise.all([
    supabase.from('delivery_pricing_settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('delivery_pricing_rules').select('*').eq('user_id', userId),
    supabase.from('delivery_order_value_rules').select('*').eq('user_id', userId),
  ])
  return { settings: settings || null, rules: rules || [], orderValueRules: orderValueRules || [] }
}

async function quoteCustomHomeDelivery(
  supabase: any,
  profile: any,
  destination: {
    street?: string | null
    street_number?: string | null
    city?: string | null
    county?: string | null
  },
  items: Array<{ quantity?: number | string; price?: number | string }>
) {
  const { settings, rules, orderValueRules } = await loadCustomDelivery(supabase, profile.user_id)
  const manual = profile.shipping_provider === 'manual'
  if (!settings?.enabled && !manual) {
    return { enabled: false as const, quote: null }
  }
  const effectiveSettings = settings?.enabled
    ? settings
    : manual
      ? { enabled: true, coverage_mode: 'romania', covered_counties: [], covered_localities: [], pricing_mode: 'order_value' }
      : settings
  if (!effectiveSettings?.enabled) {
    return { enabled: false as const, quote: null }
  }
  const quantity = (items || []).reduce(
    (sum, item) => sum + (parseInt(String(item.quantity ?? 0), 10) || 0),
    0
  )
  const orderSubtotal = (items || []).reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (parseInt(String(item.quantity ?? 0), 10) || 0),
    0
  )
  const quote = await calculateDeliveryQuote({
    settings: effectiveSettings,
    rules,
    orderValueRules,
    originAddress: buildOriginAddress(profile, settings),
    destination: {
      street: destination.street,
      street_number: destination.street_number,
      city: String(destination.city || ''),
      county: String(destination.county || ''),
    },
    quantity,
    orderSubtotal,
    mapboxToken: Deno.env.get('MAPBOX_PUBLIC_TOKEN') || '',
    shippingProvider: profile.shipping_provider,
  })
  if (
    manual &&
    quote &&
    !quote.available &&
    (quote.error === 'NO_RULE' || quote.error === 'CUSTOM_PRICING_DISABLED')
  ) {
    const fee = Number(profile.home_delivery_fee || 0)
    return {
      enabled: true as const,
      quote: {
        available: true,
        delivery_fee: fee,
        county: String(destination.county || ''),
        locality: String(destination.city || ''),
        quantity,
        charge_mode: 'flat' as const,
        snapshot: {
          method: 'flat_home',
          provider: 'manual',
          distance_charge: 'flat',
          delivery_fee: fee,
        },
      },
    }
  }
  return { enabled: true as const, quote }
}

function composeStreetAddress(input: {
  street?: string | null
  street_number?: string | null
  block?: string | null
  apartment?: string | null
  city?: string | null
  county?: string | null
}) {
  const line = [input.street, input.street_number].filter(Boolean)
  if (input.block) line.push(`bl. ${input.block}`)
  if (input.apartment) line.push(`ap. ${input.apartment}`)
  const locality = [input.city, input.county].filter(Boolean).join(', ')
  return [line.join(' '), locality].filter(Boolean).join(', ')
}

function resolveOrderBilling(
  body: any,
  deliveryType: string,
  deliveryComposite: string
) {
  const sameAsDelivery = deliveryType === 'home' && body.billing_same_as_delivery !== false
  if (sameAsDelivery) {
    return {
      ok: true as const,
      billing_same_as_delivery: true,
      billing_city: body.customer_city || null,
      billing_county: body.customer_county || null,
      billing_street: body.customer_street || null,
      billing_street_number: body.customer_street_number || null,
      billing_block: body.customer_block || null,
      billing_apartment: body.customer_apartment || null,
      billing_address: deliveryComposite,
    }
  }
  const city = String(body.billing_city || '').trim()
  const county = String(body.billing_county || '').trim()
  const street = String(body.billing_street || '').trim()
  const streetNumber = String(body.billing_street_number || '').trim()
  if (!city || !county || !street || !streetNumber) {
    return {
      ok: false as const,
      error: 'A billing address is required for the invoice.',
    }
  }
  const block = String(body.billing_block || '').trim() || null
  const apartment = String(body.billing_apartment || '').trim() || null
  return {
    ok: true as const,
    billing_same_as_delivery: false,
    billing_city: city,
    billing_county: county,
    billing_street: street,
    billing_street_number: streetNumber,
    billing_block: block,
    billing_apartment: apartment,
    billing_address: composeStreetAddress({
      street,
      street_number: streetNumber,
      block,
      apartment,
      city,
      county,
    }),
  }
}

function quoteErrorMessage(code?: string) {
  switch (code) {
    case 'OUT_OF_COVERAGE':
      return 'Delivery is not available to this location.'
    case 'NO_RULE':
      return 'Delivery is not available to this location.'
    case 'DISTANCE_UNAVAILABLE':
      return 'Could not calculate delivery distance for this address. Please check the address or try again.'
    case 'TOO_FAR':
      return 'This address is farther than the store delivers.'
    case 'ORIGIN_MISSING':
      return 'This store has not configured a delivery origin address yet.'
    case 'ADDRESS_INCOMPLETE':
      return 'Please complete the delivery address.'
    default:
      return 'Delivery is not available for this order.'
  }
}

/** Normalize eAWB locality payloads (search + getLocalities + postal reverse). */
function normalizeEawbLocality(l: any, fallbackCounty = '') {
  const name = String(
    l?.name || l?.locality_name || l?.locality || ''
  ).trim()
  const county = String(
    l?.county || l?.county_name || fallbackCounty || ''
  ).trim()
  const nameAndCounty = String(
    l?.name_and_county || (name && county ? `${name}, ${county}` : name)
  ).trim()
  const commune = String(
    l?.commune || l?.commune_name || l?.parent_name || l?.administrative_area || ''
  ).trim() || null
  const postal = l?.postal_code || l?.zip || l?.zip_code || null

  // Heuristic: if name_and_county has 3+ comma parts, middle may be commune
  let inferredCommune = commune
  if (!inferredCommune && nameAndCounty.includes(',')) {
    const parts = nameAndCounty.split(',').map((p: string) => p.trim()).filter(Boolean)
    if (parts.length >= 3) inferredCommune = parts[1]
  }

  return {
    id: l?.id ?? l?.locality_id ?? null,
    name: name || nameAndCounty,
    county,
    county_code: l?.county_code ? String(l.county_code) : null,
    name_and_county: nameAndCounty,
    commune: inferredCommune,
    postal_code: postal ? String(postal) : null,
    street_name: l?.street_name ? String(l.street_name) : null,
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url)
    // Check for API key in both query params and headers
    const apiKey = url.searchParams.get('api_key') || req.headers.get('X-API-Key')

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key is required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Verify API key and get user with netopia configuration
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        user_id, 
        store_name,
        preferred_language,
        netpopia_api_key,
        netpopia_signature,
        netpopia_sandbox,
        cash_payment_enabled,
        cash_payment_fee,
        shipping_provider,
        payment_provider,
        home_delivery_fee,
        locker_delivery_fee,
        show_stock_to_customers,
        allow_order_notes,
        eawb_street,
        eawb_street_number,
        eawb_city,
        eawb_county,
        eawb_address,
        active_template
      `)
      .eq('store_api_key', apiKey)
      .single()

    if (profileError || !profile) {
      console.log('API key verification failed:', profileError)
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if Netopia is configured for payment endpoints
    const isNetopiaConfigured = profile.netpopia_api_key && profile.netpopia_signature
    const cardEnabled = profile.payment_provider !== 'none' && !!isNetopiaConfigured

    const userId = profile.user_id

    // Handle different endpoints
    const path = url.pathname.split('/').pop()

    switch (path) {
      case 'config': {
        // Return comprehensive store configuration
        const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN') || '';
        const requestedTemplate = url.searchParams.get('template_id') || profile.active_template || 'elementar';
        const templateId = ['elementar', 'premium', 'floral', 'ai'].includes(requestedTemplate)
          ? requestedTemplate
          : 'elementar';
        
        // Fetch template customization
        const { data: customization } = await supabase
          .from('template_customization')
          .select('*')
          .eq('user_id', userId)
          .eq('template_id', templateId === 'ai' ? 'ai' : templateId === 'elementar' ? 'elementar' : templateId)
          .maybeSingle();

        const fallbackCustomization = await (async () => {
          if (customization) return customization;
          const { data } = await supabase
            .from('template_customization')
            .select('*')
            .eq('user_id', userId)
            .eq('template_id', 'elementar')
            .maybeSingle();
          return data;
        })();

        let aiSpec = null;
        if (templateId === 'ai') {
          const { data: storefront } = await supabase
            .from('ai_storefronts')
            .select('published_spec')
            .eq('user_id', userId)
            .maybeSingle();
          aiSpec = storefront?.published_spec || null;
        }

        // Fetch template blocks for the store
        const { data: templateBlocks } = await supabase
          .from('template_blocks')
          .select('*')
          .eq('user_id', userId)
          .eq('is_visible', true)
          .order('block_order', { ascending: true });

        const { data: deliverySettings } = await supabase
          .from('delivery_pricing_settings')
          .select('enabled, coverage_mode, covered_counties, covered_localities, distance_charge')
          .eq('user_id', userId)
          .maybeSingle();
        
        return new Response(
          JSON.stringify({
            user_id: userId,
            store_name: profile.store_name || 'My Store',
            preferred_language: profile.preferred_language || 'ro',
            mapbox_token: mapboxToken,
            show_stock_to_customers: profile.show_stock_to_customers !== false,
            allow_order_notes: profile.allow_order_notes !== false,
            // Payment configuration
            payment: {
              card_enabled: cardEnabled,
              cash_enabled: profile.cash_payment_enabled ?? true,
              cash_fee: profile.cash_payment_fee || 0,
              provider: cardEnabled ? 'netopia' : (profile.payment_provider === 'none' ? 'none' : null)
            },
            // Delivery configuration
            delivery: {
              home_fee: profile.home_delivery_fee || 0,
              locker_fee: profile.locker_delivery_fee || 0,
              home_enabled: true,
              locker_enabled: profile.shipping_provider !== 'manual',
              provider: profile.shipping_provider || 'eawb',
              custom_pricing_enabled: profile.shipping_provider === 'manual' || !!deliverySettings?.enabled,
              charge_mode: deliverySettings?.distance_charge === 'per_unit' ? 'per_unit' : 'flat',
              coverage_mode: deliverySettings?.coverage_mode || 'romania',
              covered_counties: deliverySettings?.covered_counties || [],
              covered_localities: deliverySettings?.covered_localities || [],
            },
            // Template customization
            customization: fallbackCustomization || {
              primary_color: '#000000',
              background_color: '#FFFFFF',
              text_color: '#000000',
              accent_color: '#666666',
              secondary_color: '#F5F5F5',
              hero_image_url: null,
              logo_url: null,
              hero_title: 'Welcome to Our Store',
              hero_subtitle: 'Discover amazing products',
              hero_button_text: 'Shop now',
              store_name: profile.store_name || 'My Store',
              show_hero_section: true,
              show_reviews: true,
              show_collection_images: true,
              font_family: 'Inter',
              heading_font: 'Inter',
              border_radius: 'rounded-lg',
              button_style: 'solid',
              navbar_style: 'transparent',
              product_card_style: 'minimal',
              animation_style: 'smooth',
              gradient_enabled: true,
              footer_text: 'All rights reserved.'
            },
            active_template: profile.active_template || 'elementar',
            ai_spec: aiSpec,
            // Template blocks for custom sections
            template_blocks: templateBlocks || [],
            // API capabilities
            api_version: '1.0',
            available_endpoints: [
              'config',
              'products',
              'product',
              'orders',
              'order-items',
              'collections',
              'collection',
              'carriers',
              'discounts',
              'payments',
              'payment-status',
              'lockers',
              'reviews',
              'product-reviews',
              'template-blocks',
              'cleanup-abandoned-orders',
              'delivery-quote',
            ],
            features: {
              products: true,
              collections: true,
              discounts: true,
              reviews: customization?.show_reviews ?? true,
              online_payments: cardEnabled,
              cash_payments: profile.cash_payment_enabled ?? true,
              home_delivery: true,
              locker_delivery: true,
              invoicing: true,
              awb_generation: true
            }
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      case 'products': {
        if (req.method === 'GET') {
          // First get products
          const { data: products, error: productsError } = await supabase
            .from('products')
            .select('*')
            .eq('user_id', userId)

          if (productsError) {
            console.log('Error fetching products:', productsError)
            return new Response(
              JSON.stringify({ error: 'Failed to fetch products' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Get product images for all products
          const productIds = products.map(p => p.id)
          const { data: productImages, error: imagesError } = await supabase
            .from('product_images')
            .select('*')
            .in('product_id', productIds)
            .order('display_order', { ascending: true })

          if (imagesError) {
            console.log('Error fetching product images:', imagesError)
          }

          // Get discounts and product discounts
          const { data: discounts, error: discountsError } = await supabase
            .from('discounts')
            .select('*')
            .eq('user_id', userId)

          const { data: productDiscounts, error: productDiscountsError } = await supabase
            .from('product_discounts')
            .select('*')

          if (discountsError) {
            console.log('Error fetching discounts:', discountsError)
          }

          if (productDiscountsError) {
            console.log('Error fetching product discounts:', productDiscountsError)
          }

          // Combine products with their images and discount information
          const productsWithImagesAndDiscounts = products.map(product => {
            const images = productImages?.filter(img => img.product_id === product.id) || []
            const primaryImage = images.find(img => img.is_primary) || images[0] || null
            
            // Calculate discount price
            const priceInfo = calculateProductPrice(
              product.id,
              product.price,
              discounts || [],
              productDiscounts || []
            )
            
            return {
              ...product,
              show_stock_to_customers:
                product.show_stock_to_customers ?? (profile.show_stock_to_customers !== false),
              images: images,
              primary_image: primaryImage?.image_url || product.image || null,
              image_count: images.length,
              // Add discount information
              original_price: priceInfo.originalPrice,
              discounted_price: priceInfo.discountedPrice,
              has_discount: priceInfo.hasDiscount,
              discount_percentage: priceInfo.discountPercentage,
              savings_amount: priceInfo.savingsAmount,
              final_price: priceInfo.discountedPrice || priceInfo.originalPrice
            }
          })

          return new Response(
            JSON.stringify({ products: productsWithImagesAndDiscounts }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        if (req.method === 'POST') {
          const body = await req.json()
          const { title, description, price, stock, sku, category, image } = body

          if (!title || !price) {
            return new Response(
              JSON.stringify({ error: 'Title and price are required' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          const { data: product, error } = await supabase
            .from('products')
            .insert({
              user_id: userId,
              title,
              description: description || null,
              price: parseFloat(price),
              stock: parseInt(stock) || 0,
              sku: sku || null,
              category: category || null,
              image: image || null
            })
            .select()
            .single()

          if (error) {
            console.log('Error creating product:', error)
            return new Response(
              JSON.stringify({ error: 'Failed to create product' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          return new Response(
            JSON.stringify({ product }),
            { 
              status: 201, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        break
      }

      case 'delivery-quote': {
        if (req.method !== 'POST') {
          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        const body = await req.json()
        const items = Array.isArray(body.items) ? body.items : []
        const { enabled, quote } = await quoteCustomHomeDelivery(
          supabase,
          profile,
          {
            street: body.street || body.customer_street,
            street_number: body.street_number || body.customer_street_number,
            city: body.city || body.customer_city,
            county: body.county || body.customer_county,
          },
          items
        )
        if (!enabled) {
          return new Response(
            JSON.stringify({ enabled: false, available: false }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        return new Response(
          JSON.stringify({
            enabled: true,
            ...quote,
            error_message: quote?.available ? null : quoteErrorMessage(quote?.error),
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'orders': {
        if (req.method === 'GET') {
          // Check if fetching a specific order
          const orderId = url.searchParams.get('order_id');
          
          if (orderId) {
            // Fetch specific order with items
            const { data: order, error } = await supabase
              .from('orders')
              .select('*')
              .eq('id', orderId)
              .eq('user_id', userId)
              .single();

            if (error) {
              console.log('Error fetching order:', error);
              return new Response(
                JSON.stringify({ error: 'Order not found' }),
                { 
                  status: 404, 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                }
              );
            }

            // Fetch order items with product details
            const { data: orderItems, error: itemsError } = await supabase
              .from('order_items')
              .select('*')
              .eq('order_id', orderId);

            if (itemsError) {
              console.log('Error fetching order items:', itemsError);
            }

            // Parse structured address for response
            const parsedAddress = {
              street: order.customer_street,
              street_number: order.customer_street_number,
              block: order.customer_block,
              apartment: order.customer_apartment,
              city: order.customer_city,
              county: order.customer_county,
              full_address: order.customer_address
            };

            return new Response(
              JSON.stringify({ 
                order: {
                  ...order,
                  parsed_address: parsedAddress,
                  items: orderItems || [],
                  item_count: orderItems?.length || 0,
                  subtotal: orderItems?.reduce((sum, item) => sum + (item.product_price * item.quantity), 0) || 0
                }
              }),
              { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }
          
          // Fetch all orders
          const { data: orders, error } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

          if (error) {
            console.log('Error fetching orders:', error)
            return new Response(
              JSON.stringify({ error: 'Failed to fetch orders' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          return new Response(
            JSON.stringify({ orders }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        if (req.method === 'POST') {
          const body = await req.json()
          const { 
            customer_name, 
            customer_email, 
            customer_phone, 
            total,
            items,
            payment_method,
            session_token,
            // Delivery type fields (optional)
            delivery_type,
            selected_carrier_code,
            locker_id,
            locker_name,
            locker_address,
            // Structured address fields (required for home delivery)
            customer_city,
            customer_county,
            customer_street,
            customer_street_number,
            customer_block,
            customer_apartment
          } = body

          // Validate delivery type
          const effectiveDeliveryType = delivery_type || 'home';

          if (profile.shipping_provider === 'manual' && effectiveDeliveryType === 'locker') {
            return new Response(
              JSON.stringify({ error: 'This store only offers its own home delivery.' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          
          // Validate required fields based on delivery type
          if (!customer_name || !customer_email || !total || !items) {
            return new Response(
              JSON.stringify({ 
                error: 'Missing required fields: customer_name, customer_email, total, items' 
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // For locker delivery, validate locker details
          if (effectiveDeliveryType === 'locker') {
            if (!selected_carrier_code || !locker_id || !locker_name) {
              return new Response(
                JSON.stringify({ 
                  error: 'Locker delivery requires: selected_carrier_code, locker_id, locker_name' 
                }),
                { 
                  status: 400, 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                }
              )
            }
          }

          // For home delivery, validate structured address
          if (effectiveDeliveryType === 'home') {
            if (!customer_city || !customer_county || !customer_street || !customer_street_number) {
              return new Response(
                JSON.stringify({ 
                  error: 'Home delivery requires address fields: customer_city, customer_county, customer_street, customer_street_number' 
                }),
                { 
                  status: 400, 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                }
              )
            }
          }

          // Create composite address from structured fields or locker address
          let compositeAddress = '';
          if (effectiveDeliveryType === 'locker') {
            compositeAddress = locker_address || locker_name || 'Locker delivery';
          } else {
            const addressParts = [customer_street, customer_street_number];
            if (customer_block) addressParts.push(`bl. ${customer_block}`);
            if (customer_apartment) addressParts.push(`ap. ${customer_apartment}`);
            compositeAddress = `${addressParts.join(' ')}, ${customer_city}, ${customer_county}`;
          }

          const billing = resolveOrderBilling(body, effectiveDeliveryType, compositeAddress)
          if (!billing.ok) {
            return new Response(
              JSON.stringify({ error: billing.error, code: 'BILLING_REQUIRED' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const snapshotItems = (items as any[]).map((item: any) => ({
            product_id: item.product_id || null,
            title: item.title,
            price: parseFloat(item.price),
            quantity: parseInt(item.quantity, 10),
          }));

          const customerNotes =
            profile.allow_order_notes === false
              ? null
              : sanitizeCustomerNotes(body.customer_notes)

          let orderTotal = parseFloat(total)
          let deliveryFeeToPersist: number | null = null
          let deliveryDistanceKm: number | null = null
          let deliverySnapshot: Record<string, unknown> | null = null

          if (effectiveDeliveryType === 'home') {
            const quoted = await quoteCustomHomeDelivery(
              supabase,
              profile,
              {
                street: customer_street,
                street_number: customer_street_number,
                city: customer_city,
                county: customer_county,
              },
              snapshotItems
            )
            if (quoted.enabled) {
              if (!quoted.quote?.available) {
                return new Response(
                  JSON.stringify({
                    error: quoteErrorMessage(quoted.quote?.error),
                    code: quoted.quote?.error || 'DELIVERY_UNAVAILABLE',
                  }),
                  { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
              }
              const subtotal = snapshotItems.reduce(
                (sum: number, item: any) => sum + item.price * item.quantity,
                0
              )
              const cashFee =
                payment_method !== 'card' && (profile.cash_payment_enabled ?? true)
                  ? Number(profile.cash_payment_fee || 0)
                  : 0
              deliveryFeeToPersist = Number(quoted.quote.delivery_fee || 0)
              deliveryDistanceKm = quoted.quote.distance_km ?? null
              deliverySnapshot = quoted.quote.snapshot || null
              orderTotal = roundMoney(subtotal + deliveryFeeToPersist + cashFee)
            }
          }

          // ===== CARD: Checkout Session only (no Order until payment confirms) =====
          if (payment_method === 'card') {
            if (!cardEnabled) {
              return new Response(
                JSON.stringify({
                  error: 'Netopia payment gateway not configured. Please configure API Key and POS Signature in Store Settings → Payment.',
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            try {
              await supabase.rpc('expire_checkout_sessions');
              await supabase.rpc('cleanup_old_checkout_sessions');
            } catch (maintainErr) {
              console.warn('Checkout session maintenance warning:', maintainErr);
            }

            const cartFingerprint = await crypto.subtle
              .digest(
                'SHA-256',
                new TextEncoder().encode(
                  JSON.stringify({
                    email: String(customer_email).trim().toLowerCase(),
                    items: snapshotItems
                      .map((i) => ({
                        product_id: i.product_id,
                        title: i.title,
                        price: i.price,
                        quantity: i.quantity,
                      }))
                      .sort((a, b) =>
                        String(a.product_id || a.title).localeCompare(String(b.product_id || b.title))
                      ),
                    total: orderTotal,
                    delivery_type: effectiveDeliveryType,
                    locker_id: locker_id || null,
                    billing_address: billing.billing_address,
                    billing_city: billing.billing_city,
                    billing_county: billing.billing_county,
                    billing_street: billing.billing_street,
                    billing_street_number: billing.billing_street_number,
                  })
                )
              )
              .then((buf) =>
                Array.from(new Uint8Array(buf))
                  .map((b) => b.toString(16).padStart(2, '0'))
                  .join('')
              );

            // Reuse an existing pending session for the same cart/customer (dedupe double-clicks)
            const { data: existingSession } = await supabase
              .from('checkout_sessions')
              .select('*')
              .eq('user_id', userId)
              .eq('customer_email', customer_email)
              .eq('cart_fingerprint', cartFingerprint)
              .eq('status', 'pending')
              .gt('expires_at', new Date().toISOString())
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            let session = existingSession;

            const billingPersist = {
              billing_same_as_delivery: billing.billing_same_as_delivery,
              billing_address: billing.billing_address,
              billing_city: billing.billing_city,
              billing_county: billing.billing_county,
              billing_street: billing.billing_street,
              billing_street_number: billing.billing_street_number,
              billing_block: billing.billing_block,
              billing_apartment: billing.billing_apartment,
            }

            if (session) {
              await supabase
                .from('checkout_sessions')
                .update(billingPersist)
                .eq('id', session.id)
            }

            if (session?.netopia_payment_url) {
              await convertAbandonedCart(supabase, userId, session_token, {
                checkout_session_id: session.id,
              });
              return new Response(
                JSON.stringify({
                  checkout_session_id: session.id,
                  payment_url: session.netopia_payment_url,
                  reused: true,
                }),
                { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            if (!session) {
              const subtotal = snapshotItems.reduce(
                (sum: number, i: any) => sum + i.price * i.quantity,
                0
              );
              const shippingAmount =
                deliveryFeeToPersist != null
                  ? deliveryFeeToPersist
                  : Math.max(0, orderTotal - subtotal);
              const { data: createdSession, error: sessionError } = await supabase
                .from('checkout_sessions')
                .insert({
                  user_id: userId,
                  status: 'pending',
                  payment_method: 'card',
                  payment_status: 'pending',
                  customer_name,
                  customer_email,
                  customer_phone: customer_phone || null,
                  customer_address: compositeAddress,
                  customer_city: customer_city || null,
                  customer_county: customer_county || null,
                  customer_street: customer_street || null,
                  customer_street_number: customer_street_number || null,
                  customer_block: customer_block || null,
                  customer_apartment: customer_apartment || null,
                  ...billingPersist,
                  delivery_type: effectiveDeliveryType,
                  selected_carrier_code: selected_carrier_code || null,
                  locker_id: locker_id || null,
                  locker_name: locker_name || null,
                  locker_address: locker_address || null,
                  items: snapshotItems,
                  cart_fingerprint: cartFingerprint,
                  subtotal,
                  shipping_amount: shippingAmount,
                  discount_amount: 0,
                  tax_amount: 0,
                  total: orderTotal,
                  customer_notes: customerNotes,
                  delivery_distance_km: deliveryDistanceKm,
                  delivery_pricing_snapshot: deliverySnapshot,
                  expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                })
                .select()
                .single();

              if (sessionError || !createdSession) {
                console.error('Error creating checkout session:', sessionError);
                return new Response(
                  JSON.stringify({ error: 'Failed to create checkout session' }),
                  { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }
              session = createdSession;
            }

            const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
            const functionUrl = `${supabaseUrl}/functions/v1/netopia-payment`;
            const refererUrl = req.headers.get('referer') || '';
            let returnUrl = '';

            // Prefer the template path from the Referer so Premium / future templates
            // return to the same storefront after Netopia (Elementar stays default).
            const resolveTemplatePath = () => {
              try {
                if (!refererUrl) return '/templates/elementar';
                const refererUrlObj = new URL(refererUrl);
                const match = refererUrlObj.pathname.match(/\/templates\/([^/?#]+)/i);
                if (match?.[1]) return `/templates/${match[1].toLowerCase()}`;
              } catch {
                /* ignore */
              }
              return '/templates/elementar';
            };
            const templatePath = resolveTemplatePath();

            if (refererUrl) {
              try {
                const refererUrlObj = new URL(refererUrl);
                const apiKeyFromReferer = refererUrlObj.searchParams.get('api_key') || apiKey;
                returnUrl = `${refererUrlObj.origin}${templatePath}?api_key=${apiKeyFromReferer}&payment_status=checking&checkout_session_id=${session.id}`;
              } catch {
                returnUrl = `${req.headers.get('origin') || ''}${templatePath}?api_key=${apiKey}&payment_status=checking&checkout_session_id=${session.id}`;
              }
            } else {
              returnUrl = `${req.headers.get('origin') || ''}${templatePath}?api_key=${apiKey}&payment_status=checking&checkout_session_id=${session.id}`;
            }

            const { data: netopiaResponse, error: netopiaError } = await supabase.functions.invoke(
              'netopia-payment',
              {
                body: {
                  action: 'create_payment',
                  user_id: userId,
                  checkout_session_id: session.id,
                  amount: orderTotal,
                  currency: 'RON',
                  customer_email,
                  customer_name,
                  customer_phone: customer_phone || '',
                  return_url: returnUrl,
                  notify_url: functionUrl,
                },
              }
            );

            if (netopiaError || !netopiaResponse?.payment_url) {
              console.error('Netopia payment error:', netopiaError || netopiaResponse);
              return new Response(
                JSON.stringify({
                  error:
                    netopiaResponse?.details ||
                    netopiaResponse?.error ||
                    'Failed to initiate payment. Please contact support.',
                  checkout_session_id: session.id,
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            await supabase
              .from('checkout_sessions')
              .update({
                netopia_payment_url: netopiaResponse.payment_url,
                netopia_payment_id: netopiaResponse.payment_id || null,
              })
              .eq('id', session.id);

            await convertAbandonedCart(supabase, userId, session_token, {
              checkout_session_id: session.id,
            });

            return new Response(
              JSON.stringify({
                checkout_session_id: session.id,
                payment_url: netopiaResponse.payment_url,
              }),
              { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // ===== CASH / COD: create Order immediately (unchanged behaviour) =====
          const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
              user_id: userId,
              customer_name,
              customer_email,
              customer_address: compositeAddress,
              customer_phone: customer_phone || null,
              total: orderTotal,
              payment_status: 'cash',
              order_status: 'paid',
              shipping_status: 'pending',
              delivery_type: effectiveDeliveryType,
              selected_carrier_code: selected_carrier_code || null,
              locker_id: locker_id || null,
              locker_name: locker_name || null,
              locker_address: locker_address || null,
              customer_city: customer_city || null,
              customer_county: customer_county || null,
              customer_street: customer_street || null,
              customer_street_number: customer_street_number || null,
              customer_block: customer_block || null,
              customer_apartment: customer_apartment || null,
              billing_same_as_delivery: billing.billing_same_as_delivery,
              billing_address: billing.billing_address,
              billing_city: billing.billing_city,
              billing_county: billing.billing_county,
              billing_street: billing.billing_street,
              billing_street_number: billing.billing_street_number,
              billing_block: billing.billing_block,
              billing_apartment: billing.billing_apartment,
              customer_notes: customerNotes,
              delivery_fee: deliveryFeeToPersist,
              delivery_distance_km: deliveryDistanceKm,
              delivery_pricing_snapshot: deliverySnapshot,
            })
            .select()
            .single();

          if (orderError) {
            console.log('Error creating order:', orderError);
            return new Response(JSON.stringify({ error: 'Failed to create order' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          const orderItems = snapshotItems.map((item: any) => ({
            order_id: order.id,
            product_id: item.product_id || null,
            product_title: item.title,
            product_price: item.price,
            quantity: item.quantity,
          }));

          const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

          if (itemsError) {
            console.log('Error creating order items:', itemsError);
            return new Response(JSON.stringify({ error: 'Failed to create order items' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          try {
            await supabase.functions.invoke('push-notification', {
              body: {
                action: 'send',
                user_ids: [userId],
                title: '🛒 Comandă nouă!',
                message: `Comandă nouă de ${orderTotal.toFixed(2)} RON de la ${customer_name}`,
                notification_type: 'order_update',
                data: {
                  order_id: order.id,
                  total: orderTotal.toString(),
                  customer_name,
                },
              },
            });
            console.log('Push notification sent for new order:', order.id);
          } catch (pushError) {
            console.error('Failed to send push notification:', pushError);
          }

          await convertAbandonedCart(supabase, userId, session_token, {
            order_id: order.id,
          });

          return new Response(JSON.stringify({ order, items: orderItems }), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break
      }

      case 'collections': {
        if (req.method === 'GET') {
          // Get all collections for the user
          const { data: collections, error: collectionsError } = await supabase
            .from('collections')
            .select('*')
            .eq('user_id', userId)
            .order('name')

          if (collectionsError) {
            console.log('Error fetching collections:', collectionsError)
            return new Response(
              JSON.stringify({ error: 'Failed to fetch collections' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Get discounts and product discounts for collections
          const { data: discounts, error: discountsError } = await supabase
            .from('discounts')
            .select('*')
            .eq('user_id', userId)

          const { data: productDiscounts, error: productDiscountsError } = await supabase
            .from('product_discounts')
            .select('*')

          if (discountsError) {
            console.log('Error fetching discounts for collections:', discountsError)
          }

          if (productDiscountsError) {
            console.log('Error fetching product discounts for collections:', productDiscountsError)
          }

          // Get products for each collection with images and discounts
          const collectionsWithProducts = await Promise.all(
            collections.map(async (collection) => {
              // Get product-collection relationships
              const { data: productCollections, error: pcError } = await supabase
                .from('product_collections')
                .select('product_id')
                .eq('collection_id', collection.id)

              if (pcError) {
                console.log('Error fetching product collections:', pcError)
                return { ...collection, products: [], product_count: 0 }
              }

              const productIds = productCollections.map(pc => pc.product_id)
              
              if (productIds.length === 0) {
                return { ...collection, products: [], product_count: 0 }
              }

              // Get products
              const { data: products, error: productsError } = await supabase
                .from('products')
                .select('*')
                .in('id', productIds)

              if (productsError) {
                console.log('Error fetching products for collection:', productsError)
                return { ...collection, products: [], product_count: 0 }
              }

              // Get images for these products
              const { data: productImages, error: imagesError } = await supabase
                .from('product_images')
                .select('*')
                .in('product_id', productIds)
                .order('display_order', { ascending: true })

              if (imagesError) {
                console.log('Error fetching product images for collection:', imagesError)
              }

              // Combine products with their images and discount information
              const productsWithImagesAndDiscounts = products.map(product => {
                const images = productImages?.filter(img => img.product_id === product.id) || []
                const primaryImage = images.find(img => img.is_primary) || images[0] || null
                
                // Calculate discount price
                const priceInfo = calculateProductPrice(
                  product.id,
                  product.price,
                  discounts || [],
                  productDiscounts || []
                )
                
                return {
                  ...product,
                  images: images,
                  primary_image: primaryImage?.image_url || product.image || null,
                  image_count: images.length,
                  // Add discount information
                  original_price: priceInfo.originalPrice,
                  discounted_price: priceInfo.discountedPrice,
                  has_discount: priceInfo.hasDiscount,
                  discount_percentage: priceInfo.discountPercentage,
                  savings_amount: priceInfo.savingsAmount,
                  final_price: priceInfo.discountedPrice || priceInfo.originalPrice
                }
              })

              return {
                ...collection,
                products: productsWithImagesAndDiscounts,
                product_count: products.length
              }
            })
          )

          return new Response(
            JSON.stringify({ collections: collectionsWithProducts }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        break
      }

      case 'payments': {
        if (req.method === 'POST') {
          // Check if Netopia is configured before processing payment
          if (!isNetopiaConfigured) {
            return new Response(
              JSON.stringify({ 
                error: 'Netopia payment gateway not configured. Please configure API Key and POS Signature in Store Settings → Payment.' 
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          const paymentData = await req.json()
          console.log('Creating payment:', paymentData)

          // Call the Netpopia payment edge function
          try {
            const { data: netopiaResponse, error: netopiaError } = await supabase.functions.invoke('netopia-payment', {
              body: {
                action: 'create_payment',
                user_id: userId, // Pass user_id explicitly for API key authentication
                ...paymentData
              },
              headers: {
                'Authorization': req.headers.get('Authorization') || `Bearer ${apiKey}`
              }
            })

            if (netopiaError) {
              console.error('Netpopia payment error:', netopiaError)
              return new Response(
                JSON.stringify({ error: 'Payment creation failed: ' + netopiaError.message }),
                { 
                  status: 500, 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                }
              )
            }

            return new Response(
              JSON.stringify(netopiaResponse),
              { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          } catch (error) {
            console.error('Unexpected payment error:', error)
            return new Response(
              JSON.stringify({ error: 'Payment service unavailable' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }
        }
        break
      }

      case 'payment-status': {
        if (req.method === 'GET') {
          // Check if Netopia is configured before checking payment status
          if (!isNetopiaConfigured) {
            return new Response(
              JSON.stringify({ 
                error: 'Netopia payment gateway not configured. Please configure API Key and POS Signature in Store Settings → Payment.' 
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          const paymentId =
            url.searchParams.get('payment_id') ||
            url.searchParams.get('checkout_session_id') ||
            url.searchParams.get('order_id')
          if (!paymentId) {
            return new Response(
              JSON.stringify({ error: 'payment_id or checkout_session_id parameter required' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          try {
            const { data: statusResponse, error: statusError } = await supabase.functions.invoke('netopia-payment', {
              body: {
                action: 'payment_status',
                user_id: userId,
                payment_id: paymentId,
                checkout_session_id: url.searchParams.get('checkout_session_id') || undefined,
              },
              headers: {
                'Authorization': req.headers.get('Authorization') || `Bearer ${apiKey}`
              }
            })

            if (statusError) {
              console.error('Payment status error:', statusError)
              return new Response(
                JSON.stringify({ error: 'Failed to get payment status: ' + statusError.message }),
                { 
                  status: 500, 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                }
              )
            }

            return new Response(
              JSON.stringify(statusResponse),
              { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          } catch (error) {
            console.error('Unexpected status check error:', error)
            return new Response(
              JSON.stringify({ error: 'Payment status service unavailable' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }
        }
        break
      }

      case 'payment-webhook': {
        if (req.method === 'POST') {
          const webhookData = await req.json()
          console.log('Processing payment webhook:', webhookData)

          try {
            const { data: webhookResponse, error: webhookError } = await supabase.functions.invoke('netopia-payment', {
              body: {
                action: 'process_webhook',
                ...webhookData
              }
            })

            if (webhookError) {
              console.error('Webhook processing error:', webhookError)
              return new Response('Error', { status: 500 })
            }

            return new Response('OK', { status: 200 })
          } catch (error) {
            console.error('Unexpected webhook error:', error)
            return new Response('Error', { status: 500 })
          }
        }
        break
      }

      case 'lockers': {
        if (req.method === 'GET') {
          // Get carrier code and location from query params
          const carrierCode = url.searchParams.get('carrier_code')
          const locality = url.searchParams.get('locality_name') || url.searchParams.get('city')
          const county = url.searchParams.get('county_name') || url.searchParams.get('county')
          const localityId = url.searchParams.get('locality_id')

          console.log('Lockers request:', { carrierCode, locality, county, localityId })

          if (!carrierCode) {
            return new Response(
              JSON.stringify({ 
                success: false,
                error: 'MISSING_CARRIER',
                message: 'carrier_code parameter is required' 
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Require a locality filter — never download all Romanian lockers
          const hasLocalityId = !!localityId && String(localityId).trim().length > 0
          const hasLocalityName = !!locality && locality.trim().length >= 2
          const hasCounty = !!county && county.trim().length >= 2

          if (!hasLocalityId && !(hasLocalityName && hasCounty) && !hasCounty) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'MISSING_LOCATION_FILTER',
                message:
                  'Provide locality_id, or county_name, or locality_name + county_name before fetching lockers.',
              }),
              {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            )
          }

          // Get user profile to access eAWB API key
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('eawb_api_key')
            .eq('user_id', userId)
            .single()

          if (profileError || !profile || !profile.eawb_api_key) {
            console.warn('eAWB API key not configured for user:', userId)
            return new Response(
              JSON.stringify({ 
                success: false,
                error: 'MISSING_API_KEY',
                message: 'eAWB API key not configured. Please configure it in Store Settings.' 
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Get carrier_id from carriers table (case-insensitive)
          const { data: carrier, error: carrierError } = await supabase
            .from('carriers')
            .select('id, name, code')
            .ilike('code', carrierCode)
            .eq('is_active', true)
            .single()

          if (carrierError || !carrier) {
            console.error('Carrier not found:', carrierCode, carrierError)
            return new Response(
              JSON.stringify({ 
                success: false,
                error: 'CARRIER_NOT_FOUND',
                message: 'Carrier not found or not active' 
              }),
              { 
                status: 404, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Fetch lockers from Europarcel API - fixed locations endpoint
          try {
            const lockerParams = new URLSearchParams({
              carrier_id: carrier.id.toString()
            })
            // Official filters only
            if (hasLocalityId) lockerParams.append('locality_id', String(localityId).trim())
            if (hasLocalityName) lockerParams.append('locality_name', locality!.trim())
            if (hasCounty) lockerParams.append('county_name', county!.trim())

            const countryCode = 'RO' // Romania
            console.log(`Fetching lockers from Europarcel for country: ${countryCode}, carrier: ${carrier.code}, params:`, lockerParams.toString())

            const response = await fetch(
              `https://api.europarcel.com/api/public/locations/fixedlocations/${countryCode}?${lockerParams.toString()}`,
              {
                method: 'GET',
                headers: {
                  'X-API-Key': profile.eawb_api_key,
                  'X-CSRF-TOKEN': profile.eawb_api_key,
                  'Accept': 'application/json'
                }
              }
            )

            const responseData = await response.json()
            
            console.log('eAWB API response status:', response.status)
            console.log('eAWB API response type:', Array.isArray(responseData) ? 'array' : typeof responseData)
            console.log('eAWB API response length:', responseData?.data?.length || responseData?.length || 0)
            
            if (!response.ok) {
              console.error('Europarcel lockers API error:', responseData)
              return new Response(
                JSON.stringify({ 
                  success: false,
                  error: 'API_ERROR',
                  message: 'Failed to fetch lockers from eAWB',
                  details: responseData 
                }),
                { 
                  status: response.status, 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                }
              )
            }

            // Normalize lockers data - API returns direct array
            const rawLockers = Array.isArray(responseData) ? responseData : []
            console.log('Sample raw locker:', rawLockers[0])

            const normalizedLockers = rawLockers
              .map((locker: any) => ({
                id: locker.id || locker.locker_id || locker.code,
                name: locker.name || locker.locker_name || locker.address,
                address: locker.address || locker.street || `${locker.locality_name || ''}, ${locker.county_name || ''}`.trim(),
                city: locker.locality_name || locker.city || locality || '',
                county: locker.county_name || locker.county || county || '',
                latitude: locker.coordinates?.lat || locker.lat || locker.latitude,
                longitude: locker.coordinates?.long || locker.lng || locker.longitude,
                carrier_id: locker.carrier_id || carrier.id,
                carrier_name: locker.carrier_name || carrier.name,
                available: locker.is_active !== false,
                is_active: locker.is_active !== false,
                allows_drop_off: locker.allows_drop_off ?? null,
                payment_type: locker.payment_type ?? null,
                schedule: locker.schedule ?? null,
                fixed_location_type: locker.fixed_location_type ?? null,
              }))
              .filter((locker: any) => {
                // Filter out lockers without valid coordinates
                const hasValidCoords = locker.latitude && locker.longitude &&
                  !isNaN(parseFloat(locker.latitude)) && 
                  !isNaN(parseFloat(locker.longitude))
                
                if (!hasValidCoords) {
                  console.warn('Filtered out locker without valid coordinates:', locker.id)
                }
                return hasValidCoords
              })

            console.log(`Normalized ${normalizedLockers.length} lockers with valid coordinates`)

            // Return lockers in a standardized format
            return new Response(
              JSON.stringify({ 
                success: true,
                carrier: {
                  id: carrier.id,
                  name: carrier.name,
                  code: carrierCode
                },
                lockers: normalizedLockers,
                count: normalizedLockers.length
              }),
              { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          } catch (error) {
            console.error('Error fetching lockers:', error)
            return new Response(
              JSON.stringify({ 
                success: false,
                error: 'FETCH_ERROR',
                message: 'Failed to fetch lockers',
                details: error instanceof Error ? error.message : 'Unknown error'
              }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }
        }
        break
      }

      case 'abandoned-carts': {
        if (req.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const body = await req.json();
        const action = body.action || 'upsert';
        const sessionToken = typeof body.session_token === 'string' ? body.session_token.trim() : '';

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: 'session_token is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (action === 'discard') {
          const { error } = await supabase
            .from('abandoned_carts')
            .update({
              status: 'discarded',
              last_activity_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('session_token', sessionToken)
            .eq('status', 'active');

          if (error) {
            console.error('Abandoned cart discard error:', error);
            return new Response(JSON.stringify({ error: 'Failed to discard abandoned cart' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify({ success: true, status: 'discarded' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (action === 'convert') {
          await convertAbandonedCart(supabase, userId, sessionToken, {
            checkout_session_id: body.checkout_session_id || null,
            order_id: body.order_id || null,
          });
          return new Response(JSON.stringify({ success: true, status: 'converted' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // upsert
        const items = Array.isArray(body.items) ? body.items : [];
        if (items.length === 0) {
          return new Response(JSON.stringify({ error: 'items required for upsert' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const snapshotItems = items.map((item: any) => ({
          product_id: item.product_id || null,
          title: item.title || item.product_title || 'Item',
          price: parseFloat(item.price ?? item.product_price ?? 0),
          quantity: parseInt(item.quantity ?? 1, 10),
        }));

        const checkoutStep = ['cart', 'checkout', 'ready'].includes(body.checkout_step)
          ? body.checkout_step
          : 'cart';

        const row = {
          user_id: userId,
          session_token: sessionToken,
          status: 'active',
          customer_name: body.customer_name || null,
          customer_email: body.customer_email || null,
          customer_phone: body.customer_phone || null,
          customer_address: body.customer_address || null,
          customer_city: body.customer_city || null,
          customer_county: body.customer_county || null,
          customer_street: body.customer_street || null,
          customer_street_number: body.customer_street_number || null,
          customer_block: body.customer_block || null,
          customer_apartment: body.customer_apartment || null,
          delivery_type: body.delivery_type || null,
          selected_carrier_code: body.selected_carrier_code || null,
          locker_id: body.locker_id || null,
          locker_name: body.locker_name || null,
          locker_address: body.locker_address || null,
          payment_method: body.payment_method || null,
          items: snapshotItems,
          cart_subtotal: parseFloat(body.cart_subtotal ?? 0) || 0,
          estimated_total: parseFloat(body.estimated_total ?? body.cart_subtotal ?? 0) || 0,
          checkout_step: checkoutStep,
          last_activity_at: new Date().toISOString(),
        };

        const { data: existing } = await supabase
          .from('abandoned_carts')
          .select('id')
          .eq('user_id', userId)
          .eq('session_token', sessionToken)
          .eq('status', 'active')
          .maybeSingle();

        let saved;
        if (existing?.id) {
          const { data, error } = await supabase
            .from('abandoned_carts')
            .update(row)
            .eq('id', existing.id)
            .select('id, status, last_activity_at')
            .single();
          if (error) {
            console.error('Abandoned cart update error:', error);
            return new Response(JSON.stringify({ error: 'Failed to update abandoned cart' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          saved = data;
        } else {
          const { data, error } = await supabase
            .from('abandoned_carts')
            .insert(row)
            .select('id, status, last_activity_at')
            .single();
          if (error) {
            console.error('Abandoned cart insert error:', error);
            return new Response(JSON.stringify({ error: 'Failed to create abandoned cart' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          saved = data;
        }

        return new Response(JSON.stringify({ success: true, abandoned_cart: saved }), {
          status: existing?.id ? 200 : 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'cleanup-abandoned-orders': {
        if (req.method === 'POST') {
          const hoursOld = 24;
          const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();

          // Maintain checkout sessions (expire pending, delete old expired)
          let expiredSessions = 0;
          let cleanedSessions = 0;
          try {
            const { data: expired } = await supabase.rpc('expire_checkout_sessions');
            const { data: cleaned } = await supabase.rpc('cleanup_old_checkout_sessions');
            expiredSessions = expired || 0;
            cleanedSessions = cleaned || 0;
          } catch (e) {
            console.warn('Session cleanup warning:', e);
          }

          let expiredAbandoned = 0;
          let cleanedAbandoned = 0;
          try {
            const { data: expiredCarts } = await supabase.rpc('expire_abandoned_carts', {
              p_idle_days: 14,
            });
            const { data: cleanedCarts } = await supabase.rpc('cleanup_old_abandoned_carts', {
              p_keep_days: 60,
            });
            expiredAbandoned = expiredCarts || 0;
            cleanedAbandoned = cleanedCarts || 0;
          } catch (e) {
            console.warn('Abandoned cart cleanup warning:', e);
          }

          // Legacy: delete old awaiting_payment orders (pre-checkout-session leftovers)
          const { data: deletedOrders, error } = await supabase
            .from('orders')
            .delete()
            .eq('user_id', userId)
            .eq('order_status', 'awaiting_payment')
            .lt('created_at', cutoffTime)
            .select();

          if (error) {
            console.error('Error cleaning up abandoned orders:', error);
            return new Response(
              JSON.stringify({
                success: false,
                error: 'CLEANUP_ERROR',
                message: 'Failed to clean up abandoned orders',
              }),
              {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              deleted_count: deletedOrders?.length || 0,
              expired_sessions: expiredSessions,
              cleaned_sessions: cleanedSessions,
              expired_abandoned_carts: expiredAbandoned,
              cleaned_abandoned_carts: cleanedAbandoned,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        break;
      }

      case 'counties': {
        if (req.method === 'GET') {
          const { data: profileRow, error: profileErr } = await supabase
            .from('profiles')
            .select('eawb_api_key')
            .eq('user_id', userId)
            .single()

          if (profileErr || !profileRow?.eawb_api_key) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'MISSING_API_KEY',
                message: 'eAWB API key not configured. Please configure it in Store Settings.',
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          try {
            const response = await fetch(
              'https://api.europarcel.com/api/public/locations/counties?country_code=RO',
              {
                method: 'GET',
                headers: {
                  'X-API-Key': profileRow.eawb_api_key,
                  'X-CSRF-TOKEN': profileRow.eawb_api_key,
                  Accept: 'application/json',
                },
              }
            )
            const raw = await response.json()
            if (!response.ok) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'API_ERROR',
                  message: 'Failed to fetch counties from eAWB',
                  details: raw,
                }),
                { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }

            const list = Array.isArray(raw) ? raw : raw?.data || []
            const counties = list.map((c: any) => ({
              id: c.id ?? c.county_id ?? null,
              code: String(c.code || c.county_code || ''),
              name: String(c.name || c.county_name || ''),
            })).filter((c: any) => c.name)

            return new Response(
              JSON.stringify({ success: true, counties, count: counties.length }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          } catch (error) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'FETCH_ERROR',
                message: error instanceof Error ? error.message : 'Failed to fetch counties',
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
        break
      }

      case 'localities': {
        if (req.method === 'GET') {
          const countyParam = (url.searchParams.get('county') || url.searchParams.get('county_code') || '').trim()
          if (!countyParam) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'MISSING_COUNTY',
                message: 'county (or county_code) is required',
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const { data: profileRow, error: profileErr } = await supabase
            .from('profiles')
            .select('eawb_api_key')
            .eq('user_id', userId)
            .single()

          if (profileErr || !profileRow?.eawb_api_key) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'MISSING_API_KEY',
                message: 'eAWB API key not configured. Please configure it in Store Settings.',
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          try {
            const eawbHeaders = {
              'X-API-Key': profileRow.eawb_api_key,
              'X-CSRF-TOKEN': profileRow.eawb_api_key,
              Accept: 'application/json',
            }

            // Resolve county name → official county_code (eAWB requires code, not display name)
            let countyCode = countyParam
            let countyName = countyParam
            const looksLikeCode = /^[A-Za-z]{1,3}$/.test(countyParam) && countyParam.length <= 3

            if (!looksLikeCode) {
              const countiesRes = await fetch(
                'https://api.europarcel.com/api/public/locations/counties?country_code=RO',
                { method: 'GET', headers: eawbHeaders }
              )
              const countiesRaw = await countiesRes.json()
              const countiesList = Array.isArray(countiesRaw) ? countiesRaw : countiesRaw?.data || []
              const norm = (s: string) =>
                String(s || '')
                  .toLowerCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/ș|ş/g, 's')
                  .replace(/ț|ţ/g, 't')
                  .trim()
              const target = norm(countyParam)
              const matched = countiesList.find((c: any) => {
                const name = norm(c.name || c.county_name || '')
                const code = String(c.code || c.county_code || '').toLowerCase()
                return name === target || code === countyParam.toLowerCase()
              })
              if (matched) {
                countyCode = String(matched.code || matched.county_code || countyParam)
                countyName = String(matched.name || matched.county_name || countyParam)
              }
            }

            const params = new URLSearchParams({
              country_code: 'RO',
              county_code: countyCode,
            })
            const response = await fetch(
              `https://api.europarcel.com/api/public/locations/localities?${params.toString()}`,
              { method: 'GET', headers: eawbHeaders }
            )
            const raw = await response.json()
            if (!response.ok) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'API_ERROR',
                  message: 'Failed to fetch localities from eAWB',
                  details: raw,
                }),
                { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }

            const list = Array.isArray(raw) ? raw : raw?.data || []
            const localities = list.map((l: any) => normalizeEawbLocality(l, countyName))

            return new Response(
              JSON.stringify({
                success: true,
                county: countyName,
                county_code: countyCode,
                localities,
                count: localities.length,
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          } catch (error) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'FETCH_ERROR',
                message: error instanceof Error ? error.message : 'Failed to fetch localities',
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
        break
      }

      case 'localities-search': {
        if (req.method === 'GET') {
          const q = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim()
          const perPageRaw = Number(url.searchParams.get('per_page') || '50')
          const perPage = [15, 50, 100, 200].includes(perPageRaw) ? perPageRaw : 50

          if (q.length < 2) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'MISSING_QUERY',
                message: 'q must be at least 2 characters',
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const { data: profileRow, error: profileErr } = await supabase
            .from('profiles')
            .select('eawb_api_key')
            .eq('user_id', userId)
            .single()

          if (profileErr || !profileRow?.eawb_api_key) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'MISSING_API_KEY',
                message: 'eAWB API key not configured. Please configure it in Store Settings.',
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          try {
            const encoded = encodeURIComponent(q)
            const response = await fetch(
              `https://api.europarcel.com/api/public/search/localities/RO/${encoded}?per_page=${perPage}`,
              {
                method: 'GET',
                headers: {
                  'X-API-Key': profileRow.eawb_api_key,
                  'X-CSRF-TOKEN': profileRow.eawb_api_key,
                  Accept: 'application/json',
                },
              }
            )
            const raw = await response.json()
            if (!response.ok) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'API_ERROR',
                  message: 'Failed to search localities from eAWB',
                  details: raw,
                }),
                { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }

            const list = Array.isArray(raw) ? raw : raw?.data || []
            const localities = list.map((l: any) => normalizeEawbLocality(l))

            return new Response(
              JSON.stringify({
                success: true,
                localities,
                count: localities.length,
                meta: raw?.meta || null,
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          } catch (error) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'FETCH_ERROR',
                message: error instanceof Error ? error.message : 'Failed to search localities',
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
        break
      }

      case 'postal-lookup': {
        if (req.method === 'GET') {
          const postal = (url.searchParams.get('postal_code') || url.searchParams.get('q') || '').trim()
          if (postal.length < 4) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'MISSING_POSTAL',
                message: 'postal_code is required',
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const { data: profileRow, error: profileErr } = await supabase
            .from('profiles')
            .select('eawb_api_key')
            .eq('user_id', userId)
            .single()

          if (profileErr || !profileRow?.eawb_api_key) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'MISSING_API_KEY',
                message: 'eAWB API key not configured.',
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          try {
            const response = await fetch(
              `https://api.europarcel.com/api/public/search/postal-code-reverse/RO/${encodeURIComponent(postal)}`,
              {
                method: 'GET',
                headers: {
                  'X-API-Key': profileRow.eawb_api_key,
                  'X-CSRF-TOKEN': profileRow.eawb_api_key,
                  Accept: 'application/json',
                },
              }
            )
            const raw = await response.json()
            if (!response.ok) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'API_ERROR',
                  message: 'Failed to lookup postal code',
                  details: raw,
                }),
                { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }

            const list = Array.isArray(raw) ? raw : raw?.data || []
            const localities = list.map((l: any) =>
              normalizeEawbLocality({
                id: l.locality_id ?? l.id,
                name: l.locality_name || l.name,
                name_and_county: l.name_and_county,
                county: l.county_name || l.county,
                county_code: l.county_code,
                postal_code: postal,
                street_name: l.street_name,
              })
            )

            // Deduplicate by locality id
            const seen = new Set<string>()
            const unique = localities.filter((l: any) => {
              const key = String(l.id || l.name)
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })

            return new Response(
              JSON.stringify({ success: true, localities: unique, count: unique.length }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          } catch (error) {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'FETCH_ERROR',
                message: error instanceof Error ? error.message : 'Postal lookup failed',
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
        break
      }

      case 'carriers': {
        if (req.method === 'GET') {
          // Get all active carriers with their services
          const { data: carriers, error: carriersError } = await supabase
            .from('carriers')
            .select('*')
            .eq('is_active', true)
            .order('name')

          if (carriersError) {
            console.log('Error fetching carriers:', carriersError)
            return new Response(
              JSON.stringify({ error: 'Failed to fetch carriers' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Get services for each carrier
          const carriersWithServices = await Promise.all(
            carriers.map(async (carrier) => {
              const { data: services, error: servicesError } = await supabase
                .from('carrier_services')
                .select('*')
                .eq('carrier_id', carrier.id)
                .eq('is_active', true)
                .order('name')

              if (servicesError) {
                console.log('Error fetching carrier services:', servicesError)
                return { ...carrier, services: [] }
              }

              return {
                ...carrier,
                services: services || []
              }
            })
          )

          return new Response(
            JSON.stringify({ carriers: carriersWithServices }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        break
      }

      case 'discounts': {
        if (req.method === 'GET') {
          // Get all active discounts for the user
          const { data: discounts, error: discountsError } = await supabase
            .from('discounts')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('created_at', { ascending: false })

          if (discountsError) {
            console.log('Error fetching discounts:', discountsError)
            return new Response(
              JSON.stringify({ error: 'Failed to fetch discounts' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Filter to only return discounts that are currently valid (date range)
          const now = new Date()
          const activeDiscounts = discounts.filter(discount => {
            const startDate = new Date(discount.start_date)
            const endDate = discount.end_date ? new Date(discount.end_date) : null
            
            return startDate <= now && (!endDate || endDate >= now)
          })

          // Get product counts for each discount
          const discountsWithProductCounts = await Promise.all(
            activeDiscounts.map(async (discount) => {
              const { count, error: countError } = await supabase
                .from('product_discounts')
                .select('*', { count: 'exact', head: true })
                .eq('discount_id', discount.id)

              if (countError) {
                console.log('Error counting discount products:', countError)
                return { ...discount, product_count: 0 }
              }

              return {
                ...discount,
                product_count: count || 0
              }
            })
          )

          return new Response(
            JSON.stringify({ discounts: discountsWithProductCounts }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        break
      }

      case 'product': {
        if (req.method === 'GET') {
          // Get single product by ID
          const productId = url.searchParams.get('id')
          
          if (!productId) {
            return new Response(
              JSON.stringify({ error: 'Product ID required' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          const { data: product, error: productError } = await supabase
            .from('products')
            .select('*')
            .eq('id', productId)
            .eq('user_id', userId)
            .single()

          if (productError) {
            console.log('Error fetching product:', productError)
            return new Response(
              JSON.stringify({ error: 'Product not found' }),
              { 
                status: 404, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Get product images
          const { data: productImages, error: imagesError } = await supabase
            .from('product_images')
            .select('*')
            .eq('product_id', productId)
            .order('display_order', { ascending: true })

          if (imagesError) {
            console.log('Error fetching product images:', imagesError)
          }

          // Get discounts for this product
          const { data: discounts, error: discountsError } = await supabase
            .from('discounts')
            .select('*')
            .eq('user_id', userId)

          const { data: productDiscounts, error: productDiscountsError } = await supabase
            .from('product_discounts')
            .select('*')
            .eq('product_id', productId)

          if (discountsError || productDiscountsError) {
            console.log('Error fetching discounts')
          }

          // Calculate discount price
          const priceInfo = calculateProductPrice(
            product.id,
            product.price,
            discounts || [],
            productDiscounts || []
          )

          const images = productImages || []
          const primaryImage = images.find(img => img.is_primary) || images[0] || null

          return new Response(
            JSON.stringify({
              product: {
                ...product,
                images: images,
                primary_image: primaryImage?.image_url || product.image || null,
                image_count: images.length,
                original_price: priceInfo.originalPrice,
                discounted_price: priceInfo.discountedPrice,
                has_discount: priceInfo.hasDiscount,
                discount_percentage: priceInfo.discountPercentage,
                savings_amount: priceInfo.savingsAmount,
                final_price: priceInfo.discountedPrice || priceInfo.originalPrice
              }
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        break
      }

      case 'collection': {
        if (req.method === 'GET') {
          // Get single collection by ID
          const collectionId = url.searchParams.get('id')
          
          if (!collectionId) {
            return new Response(
              JSON.stringify({ error: 'Collection ID required' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          const { data: collection, error: collectionError } = await supabase
            .from('collections')
            .select('*')
            .eq('id', collectionId)
            .eq('user_id', userId)
            .single()

          if (collectionError) {
            console.log('Error fetching collection:', collectionError)
            return new Response(
              JSON.stringify({ error: 'Collection not found' }),
              { 
                status: 404, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Get products in this collection
          const { data: productCollections, error: pcError } = await supabase
            .from('product_collections')
            .select('product_id')
            .eq('collection_id', collectionId)

          if (pcError) {
            console.log('Error fetching product collections:', pcError)
            return new Response(
              JSON.stringify({ ...collection, products: [], product_count: 0 }),
              { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          const productIds = productCollections.map(pc => pc.product_id)
          
          if (productIds.length === 0) {
            return new Response(
              JSON.stringify({ ...collection, products: [], product_count: 0 }),
              { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Get products with images and discounts
          const { data: products, error: productsError } = await supabase
            .from('products')
            .select('*')
            .in('id', productIds)

          if (productsError) {
            console.log('Error fetching products for collection:', productsError)
          }

          const { data: productImages, error: imagesError } = await supabase
            .from('product_images')
            .select('*')
            .in('product_id', productIds)
            .order('display_order', { ascending: true })

          const { data: discounts } = await supabase
            .from('discounts')
            .select('*')
            .eq('user_id', userId)

          const { data: productDiscounts } = await supabase
            .from('product_discounts')
            .select('*')

          const productsWithImagesAndDiscounts = (products || []).map(product => {
            const images = productImages?.filter(img => img.product_id === product.id) || []
            const primaryImage = images.find(img => img.is_primary) || images[0] || null
            
            const priceInfo = calculateProductPrice(
              product.id,
              product.price,
              discounts || [],
              productDiscounts || []
            )
            
            return {
              ...product,
              images: images,
              primary_image: primaryImage?.image_url || product.image || null,
              image_count: images.length,
              original_price: priceInfo.originalPrice,
              discounted_price: priceInfo.discountedPrice,
              has_discount: priceInfo.hasDiscount,
              discount_percentage: priceInfo.discountPercentage,
              savings_amount: priceInfo.savingsAmount,
              final_price: priceInfo.discountedPrice || priceInfo.originalPrice
            }
          })

          return new Response(
            JSON.stringify({
              ...collection,
              products: productsWithImagesAndDiscounts,
              product_count: productsWithImagesAndDiscounts.length
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        break
      }

      case 'reviews': {
        if (req.method === 'GET') {
          // Get product_id from query params (optional)
          const productId = url.searchParams.get('product_id');

          // Respect storefront visibility toggle
          const { data: customization } = await supabase
            .from('template_customization')
            .select('show_reviews')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const showReviews = customization?.show_reviews ?? true;
          if (!showReviews) {
            return new Response(
              JSON.stringify({
                reviews: [],
                total_reviews: 0,
                average_rating: 0,
                reviews_enabled: false,
              }),
              {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }
          
          let query = supabase
            .from('reviews')
            .select('id, product_id, customer_name, rating, review_text, merchant_reply, merchant_replied_at, created_at, is_approved, status')
            .eq('user_id', userId)
            .eq('is_approved', true)
            .order('created_at', { ascending: false });
          
          if (productId) {
            query = query.eq('product_id', productId);
          }
          
          const { data: reviews, error } = await query;

          if (error) {
            console.log('Error fetching reviews:', error);
            return new Response(
              JSON.stringify({ error: 'Failed to fetch reviews' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          const list = reviews || [];
          const avgRating = list.length > 0
            ? list.reduce((sum, r) => sum + r.rating, 0) / list.length
            : 0;

          return new Response(
            JSON.stringify({ 
              reviews: list,
              total_reviews: list.length,
              average_rating: parseFloat(avgRating.toFixed(1)),
              reviews_enabled: true,
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }

        if (req.method === 'POST') {
          const body = await req.json();
          const { product_id, customer_name, customer_email, rating, review_text } = body;

          if (!product_id || !customer_name || !rating) {
            return new Response(
              JSON.stringify({ 
                error: 'Missing required fields: product_id, customer_name, rating' 
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          if (rating < 1 || rating > 5) {
            return new Response(
              JSON.stringify({ error: 'Rating must be between 1 and 5' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          // Verify product belongs to this store
          const { data: product, error: productError } = await supabase
            .from('products')
            .select('id, title')
            .eq('id', product_id)
            .eq('user_id', userId)
            .single();

          if (productError || !product) {
            return new Response(
              JSON.stringify({ error: 'Product not found' }),
              { 
                status: 404, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          const { data: review, error } = await supabase
            .from('reviews')
            .insert({
              product_id,
              user_id: userId,
              customer_name: String(customer_name).trim(),
              customer_email: customer_email || null,
              rating: parseInt(rating),
              review_text: review_text || null,
              status: 'pending',
              is_approved: false,
            })
            .select()
            .single();

          if (error) {
            console.log('Error creating review:', error);
            return new Response(
              JSON.stringify({ error: 'Failed to create review' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          try {
            await supabase.functions.invoke('push-notification', {
              body: {
                action: 'send',
                user_ids: [userId],
                title: '⭐ New review pending',
                message: `${customer_name} left a ${rating}★ review on ${product.title}`,
                notification_type: 'review',
                data: {
                  review_id: review.id,
                  product_id,
                  rating: String(rating),
                },
              },
            });
          } catch (pushError) {
            console.error('Failed to send review push notification:', pushError);
          }

          return new Response(
            JSON.stringify({
              review,
              message: 'Review submitted successfully and is pending approval',
            }),
            { 
              status: 201, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }
        break;
      }

      case 'product-reviews': {
        // Get reviews for a specific product with average rating
        if (req.method === 'GET') {
          const productId = url.searchParams.get('product_id');
          
          if (!productId) {
            return new Response(
              JSON.stringify({ error: 'product_id is required' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          // Check if reviews are enabled for this store
          const { data: customization } = await supabase
            .from('template_customization')
            .select('show_reviews')
            .eq('user_id', userId)
            .maybeSingle();

          const showReviews = customization?.show_reviews ?? true;

          if (!showReviews) {
            return new Response(
              JSON.stringify({ 
                reviews: [],
                total_reviews: 0,
                average_rating: 0,
                reviews_enabled: false
              }),
              { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          const { data: reviews, error } = await supabase
            .from('reviews')
            .select('id, customer_name, rating, review_text, merchant_reply, merchant_replied_at, created_at')
            .eq('product_id', productId)
            .eq('user_id', userId)
            .eq('is_approved', true)
            .order('created_at', { ascending: false });

          if (error) {
            console.log('Error fetching product reviews:', error);
            return new Response(
              JSON.stringify({ error: 'Failed to fetch reviews' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          const list = reviews || [];
          const avgRating = list.length > 0
            ? list.reduce((sum, r) => sum + r.rating, 0) / list.length
            : 0;

          return new Response(
            JSON.stringify({ 
              reviews: list,
              total_reviews: list.length,
              average_rating: parseFloat(avgRating.toFixed(1)),
              reviews_enabled: true
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }
        break;
      }

      case 'order-items': {
        if (req.method === 'GET') {
          const orderId = url.searchParams.get('order_id');
          
          if (!orderId) {
            return new Response(
              JSON.stringify({ error: 'order_id is required' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          // Verify order belongs to this user
          const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id')
            .eq('id', orderId)
            .eq('user_id', userId)
            .single();

          if (orderError || !order) {
            return new Response(
              JSON.stringify({ error: 'Order not found' }),
              { 
                status: 404, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          // Fetch order items with product info
          const { data: items, error } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', orderId);

          if (error) {
            console.log('Error fetching order items:', error);
            return new Response(
              JSON.stringify({ error: 'Failed to fetch order items' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          // Calculate totals
          const subtotal = items.reduce((sum, item) => sum + (item.product_price * item.quantity), 0);
          const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

          return new Response(
            JSON.stringify({ 
              items,
              item_count: items.length,
              total_quantity: totalQuantity,
              subtotal
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }
        break;
      }

      case 'template-blocks': {
        if (req.method === 'GET') {
          const { data: blocks, error } = await supabase
            .from('template_blocks')
            .select('*')
            .eq('user_id', userId)
            .eq('is_visible', true)
            .order('block_order', { ascending: true });

          if (error) {
            console.log('Error fetching template blocks:', error);
            return new Response(
              JSON.stringify({ error: 'Failed to fetch template blocks' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          return new Response(
            JSON.stringify({ 
              blocks: blocks || [],
              block_count: blocks?.length || 0
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }
        break;
      }

      case 'store-info': {
        // Public store information endpoint
        if (req.method === 'GET') {
          const { data: customization } = await supabase
            .from('template_customization')
            .select('store_name, logo_url, footer_text, primary_color, background_color')
            .eq('user_id', userId)
            .single();

          // Get product count
          const { count: productCount } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

          // Get collection count
          const { count: collectionCount } = await supabase
            .from('collections')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

          // Get review stats
          const { data: reviews } = await supabase
            .from('reviews')
            .select('rating')
            .eq('user_id', userId)
            .eq('is_approved', true);

          const avgRating = reviews && reviews.length > 0
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
            : 0;

          return new Response(
            JSON.stringify({
              store_name: customization?.store_name || profile.store_name || 'My Store',
              logo_url: customization?.logo_url || null,
              footer_text: customization?.footer_text || 'All rights reserved.',
              primary_color: customization?.primary_color || '#000000',
              background_color: customization?.background_color || '#FFFFFF',
              stats: {
                product_count: productCount || 0,
                collection_count: collectionCount || 0,
                review_count: reviews?.length || 0,
                average_rating: parseFloat(avgRating.toFixed(1))
              }
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }
        break;
      }

      default: {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid endpoint',
            available_endpoints: [
              'config',
              'store-info',
              'products',
              'product',
              'orders',
              'order-items',
              'collections',
              'collection',
              'carriers',
              'discounts',
              'payments',
              'payment-status',
              'payment-webhook',
              'lockers',
              'reviews',
              'product-reviews',
              'template-blocks',
              'cleanup-abandoned-orders'
            ]
          }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.log('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})