-- Create a fictional Romanian order for testing eAWB generation
INSERT INTO public.orders (
  id,
  user_id,
  customer_name,
  customer_email, 
  customer_phone,
  customer_address,
  total,
  payment_status,
  shipping_status,
  created_at
) VALUES (
  gen_random_uuid(),
  'b67acc37-aced-45ec-a6a4-f1b385aae399',
  'Ion Popescu',
  'ion.popescu@gmail.com',
  '+40721123456',
  'Strada Victoriei nr. 15, ap. 23, Sector 1, Bucuresti, Romania',
  89.50,
  'paid',
  'pending',
  now()
);

-- Get the order ID for the order items
WITH new_order AS (
  SELECT id as order_id FROM public.orders 
  WHERE customer_name = 'Ion Popescu' 
  AND customer_email = 'ion.popescu@gmail.com'
  ORDER BY created_at DESC 
  LIMIT 1
)
INSERT INTO public.order_items (
  id,
  order_id,
  product_id,
  product_title,
  product_price,
  quantity,
  created_at
) 
SELECT 
  gen_random_uuid(),
  new_order.order_id,
  'a175b46e-9591-49ac-8e63-0836253434d0', -- existing product ID from your system
  'Produs Test România',
  89.50,
  1,
  now()
FROM new_order;