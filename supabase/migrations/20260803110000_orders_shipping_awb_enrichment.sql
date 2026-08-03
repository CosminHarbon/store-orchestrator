-- Enrich orders with AWB shipping metadata (print, COD, locker deposit code)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS awb_label_url text,
  ADD COLUMN IF NOT EXISTS awb_service_name text,
  ADD COLUMN IF NOT EXISTS awb_service_id integer,
  ADD COLUMN IF NOT EXISTS awb_carrier_id integer,
  ADD COLUMN IF NOT EXISTS awb_shipping_cost numeric,
  ADD COLUMN IF NOT EXISTS awb_cod_amount numeric,
  ADD COLUMN IF NOT EXISTS locker_deposit_code text,
  ADD COLUMN IF NOT EXISTS awb_response_extra jsonb;

COMMENT ON COLUMN public.orders.locker_deposit_code IS 'Locker drop-off / deposit / PIN code from eAWB create-order response when provided';
COMMENT ON COLUMN public.orders.awb_cod_amount IS 'Cash-on-delivery amount sent to eAWB as bank_repayment_amount';
