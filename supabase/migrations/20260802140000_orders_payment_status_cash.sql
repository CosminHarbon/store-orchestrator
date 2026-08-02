-- Allow cash/COD payment status on orders (distinct from unpaid card "pending")
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text, 'cash'::text, 'invoiced'::text]));

-- Backfill existing COD orders (created as pending + order_status paid)
UPDATE public.orders
SET payment_status = 'cash',
    updated_at = now()
WHERE payment_status = 'pending'
  AND order_status = 'paid';
