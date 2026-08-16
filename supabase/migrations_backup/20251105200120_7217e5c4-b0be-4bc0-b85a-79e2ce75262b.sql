-- Add order_status enum type
CREATE TYPE order_status_enum AS ENUM ('draft', 'awaiting_payment', 'paid', 'cancelled');

-- Add order_status column to orders table
ALTER TABLE orders ADD COLUMN order_status order_status_enum DEFAULT 'awaiting_payment';

-- Update existing orders to have appropriate status based on payment_status
UPDATE orders SET order_status = 
  CASE 
    WHEN payment_status = 'paid' THEN 'paid'::order_status_enum
    ELSE 'awaiting_payment'::order_status_enum
  END;

-- Drop the existing trigger that reduces stock immediately on order_items INSERT
DROP TRIGGER IF EXISTS trigger_update_stock_on_order ON order_items;

-- Create new function to reduce stock when order status changes to 'paid'
CREATE OR REPLACE FUNCTION reduce_stock_on_order_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Only reduce stock when order transitions to 'paid' status
  IF NEW.order_status = 'paid' AND (OLD.order_status IS NULL OR OLD.order_status != 'paid') THEN
    -- Reduce stock for all items in this order
    UPDATE public.products p
    SET 
      stock = p.stock - oi.quantity,
      updated_at = now()
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id AND oi.product_id = p.id;
    
    -- Check if any product went below zero and log warning
    IF EXISTS (
      SELECT 1 FROM public.products p
      INNER JOIN public.order_items oi ON oi.product_id = p.id
      WHERE oi.order_id = NEW.id AND p.stock < 0
    ) THEN
      RAISE NOTICE 'Warning: Some products have negative stock after order %', NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on orders table to reduce stock when paid
CREATE TRIGGER trigger_reduce_stock_on_order_paid
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION reduce_stock_on_order_paid();

-- Create function to restore stock when order is cancelled
CREATE OR REPLACE FUNCTION restore_stock_on_order_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Restore stock when order transitions to 'cancelled' status
  IF NEW.order_status = 'cancelled' AND OLD.order_status != 'cancelled' THEN
    -- Restore stock for all items in this order (only if it was previously paid)
    IF OLD.order_status = 'paid' THEN
      UPDATE public.products p
      SET 
        stock = p.stock + oi.quantity,
        updated_at = now()
      FROM public.order_items oi
      WHERE oi.order_id = NEW.id AND oi.product_id = p.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on orders table to restore stock when cancelled
CREATE TRIGGER trigger_restore_stock_on_order_cancel
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION restore_stock_on_order_cancel();