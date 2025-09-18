-- Create a new test order with proper Romanian addresses for testing
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
  'b67acc37-aced-45ec-a6a4-f1b385aae399',
  'Maria Popescu', 
  'maria.popescu@gmail.com', 
  '+40721234567', 
  'Strada Victoriei nr. 10, ap. 5, Sector 1, Bucuresti, Romania', 
  45.50, 
  'paid', 
  'pending'
);

-- Also create corresponding order items
INSERT INTO order_items (
  order_id,
  product_id,
  product_title,
  product_price,
  quantity
) VALUES (
  (SELECT id FROM orders WHERE customer_email = 'maria.popescu@gmail.com' ORDER BY created_at DESC LIMIT 1),
  'b6d82653-b95f-42e3-b708-c86651179ef4',
  'Test Product',
  45.50,
  1
);