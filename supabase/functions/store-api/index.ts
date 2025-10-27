import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
          total: number
          payment_status: string
          shipping_status: string
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
    const apiKey = url.searchParams.get('api_key')

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
        netpopia_sandbox
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
            // Structured address fields (required)
            customer_city,
            customer_county,
            customer_street,
            customer_street_number,
            customer_block,
            customer_apartment
          } = body

          // Validate required fields including structured address
          if (!customer_name || !customer_email || !total || !items || 
              !customer_city || !customer_county || !customer_street || !customer_street_number) {
            return new Response(
              JSON.stringify({ 
                error: 'Missing required fields. All address fields are required: customer_city, customer_county, customer_street, customer_street_number' 
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Create composite address from structured fields for legacy support
          const addressParts = [customer_street, customer_street_number];
          if (customer_block) addressParts.push(`bl. ${customer_block}`);
          if (customer_apartment) addressParts.push(`ap. ${customer_apartment}`);
          const compositeAddress = `${addressParts.join(' ')}, ${customer_city}, ${customer_county}`;

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
              shipping_status: 'pending',
              // Store structured address fields (all required)
              customer_city,
              customer_county,
              customer_street,
              customer_street_number,
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

      default: {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid endpoint',
            available_endpoints: ['products', 'orders', 'collections', 'payments', 'payment-status', 'payment-webhook']
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