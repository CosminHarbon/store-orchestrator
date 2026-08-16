-- Create function to update product stock when order items are inserted
CREATE OR REPLACE FUNCTION public.update_product_stock_on_order()
RETURNS TRIGGER AS $$
BEGIN
  -- Update stock by reducing the quantity ordered
  UPDATE public.products 
  SET 
    stock = stock - NEW.quantity,
    updated_at = now()
  WHERE id = NEW.product_id;
  
  -- Check if stock went below zero and log a warning
  IF (SELECT stock FROM public.products WHERE id = NEW.product_id) < 0 THEN
    RAISE NOTICE 'Warning: Product % stock is now negative: %', 
      NEW.product_title, 
      (SELECT stock FROM public.products WHERE id = NEW.product_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically update stock when order items are inserted
CREATE TRIGGER trigger_update_stock_on_order
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_stock_on_order();

-- Create function to restore stock when order items are deleted (for order cancellations)
CREATE OR REPLACE FUNCTION public.restore_product_stock_on_order_cancel()
RETURNS TRIGGER AS $$
BEGIN
  -- Restore stock by adding back the quantity that was ordered
  UPDATE public.products 
  SET 
    stock = stock + OLD.quantity,
    updated_at = now()
  WHERE id = OLD.product_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to restore stock when order items are deleted
CREATE TRIGGER trigger_restore_stock_on_order_cancel
  AFTER DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_product_stock_on_order_cancel();

-- Create function for bulk stock updates with validation
CREATE OR REPLACE FUNCTION public.bulk_update_stock(
  updates jsonb
)
RETURNS TABLE(
  product_id uuid,
  old_stock integer,
  new_stock integer,
  success boolean,
  error_message text
) AS $$
DECLARE
  update_record jsonb;
  current_stock integer;
  new_stock_value integer;
  product_uuid uuid;
BEGIN
  -- Loop through each update in the JSON array
  FOR update_record IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    BEGIN
      -- Extract values from JSON
      product_uuid := (update_record->>'product_id')::uuid;
      new_stock_value := (update_record->>'stock')::integer;
      
      -- Get current stock
      SELECT stock INTO current_stock 
      FROM public.products 
      WHERE id = product_uuid;
      
      IF current_stock IS NULL THEN
        -- Product not found
        RETURN QUERY SELECT 
          product_uuid,
          NULL::integer,
          NULL::integer,
          false,
          'Product not found'::text;
        CONTINUE;
      END IF;
      
      -- Update the stock
      UPDATE public.products 
      SET 
        stock = new_stock_value,
        updated_at = now()
      WHERE id = product_uuid;
      
      -- Return success result
      RETURN QUERY SELECT 
        product_uuid,
        current_stock,
        new_stock_value,
        true,
        NULL::text;
        
    EXCEPTION WHEN OTHERS THEN
      -- Return error result
      RETURN QUERY SELECT 
        product_uuid,
        current_stock,
        NULL::integer,
        false,
        SQLERRM::text;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;