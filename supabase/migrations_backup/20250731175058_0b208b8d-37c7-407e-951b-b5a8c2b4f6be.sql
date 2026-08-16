-- Remove the duplicate stock update trigger to fix double stock deduction
DROP TRIGGER IF EXISTS trigger_update_stock_on_order ON order_items;

-- Keep only the main trigger_update_product_stock which handles all stock operations correctly