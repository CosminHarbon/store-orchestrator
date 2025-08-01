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

    // Verify API key and get user
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, store_name')
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

          // Combine products with their images
          const productsWithImages = products.map(product => {
            const images = productImages?.filter(img => img.product_id === product.id) || []
            const primaryImage = images.find(img => img.is_primary) || images[0] || null
            
            return {
              ...product,
              images: images,
              primary_image: primaryImage?.image_url || product.image || null,
              image_count: images.length
            }
          })

          return new Response(
            JSON.stringify({ products: productsWithImages }),
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
            customer_address, 
            customer_phone, 
            total,
            items 
          } = body

          if (!customer_name || !customer_email || !customer_address || !total || !items) {
            return new Response(
              JSON.stringify({ error: 'Missing required fields' }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }

          // Create order
          const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
              user_id: userId,
              customer_name,
              customer_email,
              customer_address,
              customer_phone: customer_phone || null,
              total: parseFloat(total),
              payment_status: 'pending',
              shipping_status: 'pending'
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

          // Get products for each collection with images
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

              // Combine products with their images
              const productsWithImages = products.map(product => {
                const images = productImages?.filter(img => img.product_id === product.id) || []
                const primaryImage = images.find(img => img.is_primary) || images[0] || null
                
                return {
                  ...product,
                  images: images,
                  primary_image: primaryImage?.image_url || product.image || null,
                  image_count: images.length
                }
              })

              return {
                ...collection,
                products: productsWithImages,
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

      default: {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid endpoint',
            available_endpoints: ['products', 'orders', 'collections']
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