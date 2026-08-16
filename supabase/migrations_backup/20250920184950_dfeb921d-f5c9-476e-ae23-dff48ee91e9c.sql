-- Update carrier API base URLs with correct endpoints for each carrier
UPDATE carriers SET api_base_url = 'https://api.sameday.ro' WHERE code = 'sameday';
UPDATE carriers SET api_base_url = 'https://api.dpd.ro' WHERE code = 'dpd';
UPDATE carriers SET api_base_url = 'https://api.gls-group.eu' WHERE code = 'gls';
UPDATE carriers SET api_base_url = 'https://api.urgentcargus.ro' WHERE code = 'cargus';
UPDATE carriers SET api_base_url = 'https://api.fancourier.ro' WHERE code = 'fan_courier';

-- Update service codes to match actual carrier API expectations
-- Sameday service codes
UPDATE carrier_services SET service_code = 'SAMEDAY_H2H' WHERE carrier_id = 6 AND name = 'Home to Home';
UPDATE carrier_services SET service_code = 'SAMEDAY_H2L' WHERE carrier_id = 6 AND name = 'Home to Locker';
UPDATE carrier_services SET service_code = 'SAMEDAY_L2H' WHERE carrier_id = 6 AND name = 'Locker to Home';
UPDATE carrier_services SET service_code = 'SAMEDAY_L2L' WHERE carrier_id = 6 AND name = 'Locker to Locker';

-- DPD service codes
UPDATE carrier_services SET service_code = 'DPD_CLASSIC' WHERE carrier_id = 2 AND name = 'Home to Home';
UPDATE carrier_services SET service_code = 'DPD_PICKUP' WHERE carrier_id = 2 AND name = 'Home to Locker';
UPDATE carrier_services SET service_code = 'DPD_DELIVERY' WHERE carrier_id = 2 AND name = 'Locker to Home';
UPDATE carrier_services SET service_code = 'DPD_SHOP2SHOP' WHERE carrier_id = 2 AND name = 'Locker to Locker';

-- GLS service codes
UPDATE carrier_services SET service_code = 'GLS_BUSINESS' WHERE carrier_id = 4 AND name = 'Home to Home';

-- Cargus service codes
UPDATE carrier_services SET service_code = 'CARGUS_STANDARD' WHERE carrier_id = 1 AND name = 'Home to Home';
UPDATE carrier_services SET service_code = 'CARGUS_PICKUP' WHERE carrier_id = 1 AND name = 'Home to Locker';
UPDATE carrier_services SET service_code = 'CARGUS_DELIVERY' WHERE carrier_id = 1 AND name = 'Locker to Home';

-- FAN Courier service codes
UPDATE carrier_services SET service_code = 'FAN_STANDARD' WHERE carrier_id = 3 AND name = 'Home to Home';
UPDATE carrier_services SET service_code = 'FAN_PICKUP' WHERE carrier_id = 3 AND name = 'Home to Locker';
UPDATE carrier_services SET service_code = 'FAN_DELIVERY' WHERE carrier_id = 3 AND name = 'Locker to Home';
UPDATE carrier_services SET service_code = 'FAN_SHOP2SHOP' WHERE carrier_id = 3 AND name = 'Locker to Locker';