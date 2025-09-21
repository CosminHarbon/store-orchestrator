-- Create a test order with a dummy user_id for eAWB testing
INSERT INTO orders (
  user_id,
  customer_name,
  customer_email,
  customer_phone,
  customer_address,
  total,
  payment_status,
  shipping_status
) VALUES (
  gen_random_uuid(), -- Use a random UUID as dummy user_id
  'Test Customer',
  'test@example.com',
  '+40712345678',
  'Strada Victoriei nr. 1, București, România',
  99.99,
  'pending',
  'pending'
);

-- Add some test order items
INSERT INTO order_items (
  order_id,
  product_title,
  product_price,
  quantity
) SELECT 
  o.id,
  'Test Product 1',
  45.50,
  1
FROM orders o 
WHERE o.customer_email = 'test@example.com'
  AND o.customer_name = 'Test Customer'
ORDER BY o.created_at DESC
LIMIT 1;

INSERT INTO order_items (
  order_id,
  product_title,
  product_price,
  quantity
) SELECT 
  o.id,
  'Test Product 2',
  54.49,
  1
FROM orders o 
WHERE o.customer_email = 'test@example.com'
  AND o.customer_name = 'Test Customer'
ORDER BY o.created_at DESC
LIMIT 1;