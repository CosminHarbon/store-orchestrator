-- Create function to update product stock when order items are created/deleted
CREATE OR REPLACE FUNCTION public.update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle INSERT (reduce stock)
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products 
    SET stock = stock - NEW.quantity
    WHERE id = NEW.product_id;
    
    -- Check if stock goes negative
    IF (SELECT stock FROM public.products WHERE id = NEW.product_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product. Available: %, Requested: %', 
        (SELECT stock + NEW.quantity FROM public.products WHERE id = NEW.product_id), 
        NEW.quantity;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Handle DELETE (restore stock)
  IF TG_OP = 'DELETE' THEN
    UPDATE public.products 
    SET stock = stock + OLD.quantity
    WHERE id = OLD.product_id;
    
    RETURN OLD;
  END IF;
  
  -- Handle UPDATE (adjust stock difference)
  IF TG_OP = 'UPDATE' THEN
    -- Only update if quantity changed
    IF OLD.quantity != NEW.quantity THEN
      UPDATE public.products 
      SET stock = stock + OLD.quantity - NEW.quantity
      WHERE id = NEW.product_id;
      
      -- Check if stock goes negative
      IF (SELECT stock FROM public.products WHERE id = NEW.product_id) < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for product. Available: %, Requested: %', 
          (SELECT stock + NEW.quantity - OLD.quantity FROM public.products WHERE id = NEW.product_id), 
          NEW.quantity;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic stock updates
CREATE TRIGGER trigger_update_product_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_stock();

-- Create function for bulk stock updates
CREATE OR REPLACE FUNCTION public.bulk_update_stock(stock_updates jsonb)
RETURNS json AS $$
DECLARE
  update_item jsonb;
  product_id uuid;
  new_stock integer;
  updated_count integer := 0;
  error_count integer := 0;
  results json;
BEGIN
  -- Loop through each stock update
  FOR update_item IN SELECT * FROM jsonb_array_elements(stock_updates)
  LOOP
    BEGIN
      product_id := (update_item->>'product_id')::uuid;
      new_stock := (update_item->>'stock')::integer;
      
      -- Validate that the product exists and belongs to the current user
      IF NOT EXISTS (
        SELECT 1 FROM public.products 
        WHERE id = product_id AND user_id = auth.uid()
      ) THEN
        error_count := error_count + 1;
        CONTINUE;
      END IF;
      
      -- Update the stock
      UPDATE public.products
      SET stock = new_stock,
          updated_at = now()
      WHERE id = product_id AND user_id = auth.uid();
      
      updated_count := updated_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
    END;
  END LOOP;
  
  -- Return results
  results := json_build_object(
    'updated_count', updated_count,
    'error_count', error_count,
    'success', error_count = 0
  );
  
  RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;