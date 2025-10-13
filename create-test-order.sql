-- Create a test order in Ploiești, Prahova
-- Run this in the Supabase SQL Editor

INSERT INTO orders (
  customer_name, 
  customer_email, 
  customer_phone, 
  customer_address,
  customer_city,
  customer_county,
  customer_street,
  customer_street_number,
  total,
  payment_status,
  shipping_status,
  user_id
) 
SELECT 
  'BARRY WHITE',
  'barry.white@example.com',
  '+40712345678',
  'Strada Republicii Nr. 25, Ploiești, Prahova',
  'Ploiești',
  'Prahova',
  'Strada Republicii',
  '25',
  150.00,
  'pending',
  'pending',
  user_id
FROM profiles
LIMIT 1
RETURNING *;
