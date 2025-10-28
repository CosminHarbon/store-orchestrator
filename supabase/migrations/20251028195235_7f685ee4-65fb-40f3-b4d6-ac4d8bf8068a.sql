-- Add locker delivery support to orders table
ALTER TABLE orders 
ADD COLUMN delivery_type TEXT DEFAULT 'home' CHECK (delivery_type IN ('home', 'locker')),
ADD COLUMN selected_carrier_code TEXT,
ADD COLUMN locker_id TEXT,
ADD COLUMN locker_name TEXT,
ADD COLUMN locker_address TEXT;

-- Add comment for clarity
COMMENT ON COLUMN orders.delivery_type IS 'Type of delivery: home (standard address) or locker (pickup point)';
COMMENT ON COLUMN orders.selected_carrier_code IS 'Carrier code selected by customer for locker delivery';
COMMENT ON COLUMN orders.locker_id IS 'Unique identifier of the selected locker';
COMMENT ON COLUMN orders.locker_name IS 'Display name of the selected locker';
COMMENT ON COLUMN orders.locker_address IS 'Full address of the selected locker';