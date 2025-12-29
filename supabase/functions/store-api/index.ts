import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

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
        netpopia_api_key,
        netpopia_signature,
        netpopia_sandbox,
        cash_payment_enabled,
        cash_payment_fee,
        home_delivery_fee,
        locker_delivery_fee
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

    const userId = profile.user_id

    // Handle different endpoints
    const path = url.pathname.split('/').pop()

    switch (path) {
      case 'config': {
        // Return comprehensive store configuration
        const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN') || '';
        
        // Fetch template customization
        const { data: customization } = await supabase
          .from('template_customization')
          .select('*')
          .eq('user_id', userId)
          .eq('template_id', 'elementar')
          .single();

        // Fetch template blocks for the store
        const { data: templateBlocks } = await supabase
          .from('template_blocks')
          .select('*')
          .eq('user_id', userId)
          .eq('is_visible', true)
          .order('block_order', { ascending: true });

        // Check payment provider configuration
        const isNetopiaConfigured = profile.netpopia_api_key && profile.netpopia_signature;
        
        return new Response(
          JSON.stringify({
            user_id: userId,
            store_name: profile.store_name || 'My Store',
            mapbox_token: mapboxToken,
            // Payment configuration
            payment: {
              card_enabled: !!isNetopiaConfigured,
              cash_enabled: profile.cash_payment_enabled ?? true,
              cash_fee: profile.cash_payment_fee || 0,
              provider: isNetopiaConfigured ? 'netopia' : null
            },
            // Delivery configuration
            delivery: {
              home_fee: profile.home_delivery_fee || 0,
              locker_fee: profile.locker_delivery_fee || 0,
              home_enabled: true,
              locker_enabled: true
            },
            // Template customization
            customization: customization || {
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
              'cleanup-abandoned-orders'
            ],
            features: {
              products: true,
              collections: true,
              discounts: true,
              reviews: customization?.show_reviews ?? true,
              online_payments: !!isNetopiaConfigured,
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

          // Create order
          const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
              user_id: userId,
              customer_name,
              customer_email,
              customer_address: compositeAddress,
              customer_phone: customer_phone || null,
              total: parseFloat(total),
              payment_status: 'pending',
              order_status: payment_method === 'card' ? 'awaiting_payment' : 'paid',
              shipping_status: 'pending',
              // Delivery type fields
              delivery_type: effectiveDeliveryType,
              selected_carrier_code: selected_carrier_code || null,
              locker_id: locker_id || null,
              locker_name: locker_name || null,
              locker_address: locker_address || null,
              // Store structured address fields (for home delivery)
              customer_city: customer_city || null,
              customer_county: customer_county || null,
              customer_street: customer_street || null,
              customer_street_number: customer_street_number || null,
              customer_block: customer_block || null,
              customer_apartment: customer_apartment || null
            })
            .select()
            .single()

          if (orderError) {
            console.log('Error creating order:', orderError)
            return new Response(
              JSON.stringify({ error: 'Failed to create order' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Create order items
          const orderItems = items.map((item: any) => ({
            order_id: order.id,
            product_id: item.product_id || null,
            product_title: item.title,
            product_price: parseFloat(item.price),
            quantity: parseInt(item.quantity)
          }))

          const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItems)

          if (itemsError) {
            console.log('Error creating order items:', itemsError)
            return new Response(
              JSON.stringify({ error: 'Failed to create order items' }),
              { 
                status: 500, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // If payment method is card, initiate Netopia payment
          if (payment_method === 'card') {
            try {
              // Get the base URL for callbacks
              const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
              const functionUrl = `${supabaseUrl}/functions/v1/netopia-payment`;
              
              // Get the referer which should be the template page
              const refererUrl = req.headers.get('referer') || '';
              let returnUrl = '';
              
              if (refererUrl) {
                try {
                  const refererUrlObj = new URL(refererUrl);
                  // Extract api_key from referer
                  const apiKeyFromReferer = refererUrlObj.searchParams.get('api_key') || apiKey;
                  // Build proper return URL to template
                  returnUrl = `${refererUrlObj.origin}/templates/elementar?api_key=${apiKeyFromReferer}&payment_status=checking&order_id=${order.id}`;
                } catch (e) {
                  // Fallback if URL parsing fails
                  returnUrl = `${req.headers.get('origin') || ''}/templates/elementar?api_key=${apiKey}&payment_status=checking&order_id=${order.id}`;
                }
              } else {
                // Fallback if no referer
                returnUrl = `${req.headers.get('origin') || ''}/templates/elementar?api_key=${apiKey}&payment_status=checking&order_id=${order.id}`;
              }
              
              const { data: netopiaResponse, error: netopiaError } = await supabase.functions.invoke('netopia-payment', {
                body: {
                  action: 'create_payment',
                  user_id: userId,
                  order_id: order.id,
                  amount: parseFloat(total),
                  currency: 'RON',
                  customer_email,
                  customer_name,
                  return_url: returnUrl,
                  notify_url: functionUrl
                }
              })

              if (netopiaError) {
                console.error('Netopia payment error:', netopiaError)
                // Return order anyway but without payment URL
                return new Response(
                  JSON.stringify({ 
                    order, 
                    items: orderItems,
                    error: 'Failed to initiate payment. Please contact support.'
                  }),
                  { 
                    status: 201, 
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                  }
                )
              }

              if (netopiaResponse?.payment_url) {
                // Don't send notification yet for card payments - wait for payment confirmation
                // The netopia-payment function will handle this when payment is confirmed
                return new Response(
                  JSON.stringify({ 
                    order, 
                    items: orderItems,
                    payment_url: netopiaResponse.payment_url
                  }),
                  { 
                    status: 201, 
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                  }
                )
              }
            } catch (error) {
              console.error('Error calling Netopia:', error)
            }
          }

          // Send push notification for new order (cash payment - already marked as paid)
          try {
            await supabase.functions.invoke('push-notification', {
              body: {
                action: 'send',
                user_ids: [userId],
                title: '🛒 Comandă nouă!',
                message: `Comandă nouă de ${parseFloat(total).toFixed(2)} RON de la ${customer_name}`,
                notification_type: 'order_update',
                data: {
                  order_id: order.id,
                  total: total.toString(),
                  customer_name
                }
              }
            });
            console.log('Push notification sent for new order:', order.id);
          } catch (pushError) {
            console.error('Failed to send push notification:', pushError);
            // Don't fail the order creation if push fails
          }

          return new Response(
            JSON.stringify({ order, items: orderItems }),
            { 
              status: 201, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
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
                error: 'Netopia payment gateway not configured. Please configure API key and signature in your store settings.' 
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
                error: 'Netopia payment gateway not configured. Please configure API key and signature in your store settings.' 
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          const paymentId = url.searchParams.get('payment_id')
          if (!paymentId) {
            return new Response(
              JSON.stringify({ error: 'payment_id parameter required' }),
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
                user_id: userId, // Pass user_id explicitly for API key authentication
                payment_id: paymentId
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

          console.log('Lockers request:', { carrierCode, locality, county })

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
            // Add optional filters only if provided
            if (locality) lockerParams.append('locality_name', locality)
            if (county) lockerParams.append('county_name', county)

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
                city: locker.locality_name || locker.city || locality,
                county: locker.county_name || locker.county || county,
                latitude: locker.coordinates?.lat || locker.lat || locker.latitude,
                longitude: locker.coordinates?.long || locker.lng || locker.longitude,
                carrier_id: carrier.id,
                available: locker.is_active !== false
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

      case 'cleanup-abandoned-orders': {
        if (req.method === 'POST') {
          const hoursOld = 24; // Delete orders older than 24 hours
          const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();
          
          // Delete old awaiting_payment orders
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
                message: 'Failed to clean up abandoned orders'
              }),
              { 
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }
            
          return new Response(
            JSON.stringify({ 
              success: true, 
              deleted_count: deletedOrders?.length || 0 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        break;
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
          
          let query = supabase
            .from('reviews')
            .select('*')
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

          // Calculate average rating
          const avgRating = reviews.length > 0
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
            : 0;

          return new Response(
            JSON.stringify({ 
              reviews,
              total_reviews: reviews.length,
              average_rating: parseFloat(avgRating.toFixed(1))
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
            .select('id')
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
              customer_name,
              customer_email: customer_email || null,
              rating: parseInt(rating),
              review_text: review_text || null,
              is_approved: false // Pending by default, owner must approve
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

          return new Response(
            JSON.stringify({ review, message: 'Review submitted successfully' }),
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
            .select('id, customer_name, rating, review_text, created_at')
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

          const avgRating = reviews.length > 0
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
            : 0;

          return new Response(
            JSON.stringify({ 
              reviews,
              total_reviews: reviews.length,
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