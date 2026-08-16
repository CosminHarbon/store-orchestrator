-- Update the Ion Popescu order with AWB information
UPDATE public.orders 
SET 
  awb_number = 'EAWB1234567890',
  carrier_name = 'Sameday Courier',
  tracking_url = 'https://tracking.sameday.ro/awb/EAWB1234567890',
  estimated_delivery_date = CURRENT_DATE + INTERVAL '2 days',
  updated_at = now()
WHERE customer_name = 'Ion Popescu' 
  AND awb_number IS NULL;