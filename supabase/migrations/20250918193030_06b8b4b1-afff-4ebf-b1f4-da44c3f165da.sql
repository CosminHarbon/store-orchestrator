-- Update carriers table with correct data
UPDATE carriers SET name = 'Cargus', code = 'cargus' WHERE id = 1;
UPDATE carriers SET name = 'DPD', code = 'dpd' WHERE id = 2;
UPDATE carriers SET name = 'FAN Courier', code = 'fan_courier' WHERE id = 3;

-- Add missing carriers
INSERT INTO carriers (id, name, code, api_base_url) VALUES 
(4, 'GLS', 'gls', 'https://api.europarcel.com'),
(6, 'Sameday', 'sameday', 'https://api.europarcel.com'),
(16, 'Bookurier', 'bookurier', 'https://api.europarcel.com')
ON CONFLICT (id) DO UPDATE SET 
name = EXCLUDED.name,
code = EXCLUDED.code;

-- Update carrier services with correct data
DELETE FROM carrier_services;
INSERT INTO carrier_services (id, carrier_id, name, service_code, description) VALUES
(1, 1, 'Home to Home', '1', 'Standard door-to-door delivery service with pickup from sender address and delivery to recipient address'),
(2, 1, 'Home to Locker', '2', 'Delivery from sender address to a secure pickup locker for convenient recipient collection'),
(3, 1, 'Locker to Home', '3', 'Pickup from a drop-off locker with delivery directly to recipient address'),
(4, 1, 'Locker to Locker', '4', 'Full automated service using pickup and delivery through secure locker network'),
(5, 1, 'Pallet', '5', 'Large shipment delivery service specifically designed for palletized goods and freight'),

(6, 2, 'Home to Home', '1', 'Standard door-to-door delivery service with pickup from sender address and delivery to recipient address'),
(7, 2, 'Home to Locker', '2', 'Delivery from sender address to a secure pickup locker for convenient recipient collection'),
(8, 2, 'Locker to Home', '3', 'Pickup from a drop-off locker with delivery directly to recipient address'),
(9, 2, 'Locker to Locker', '4', 'Full automated service using pickup and delivery through secure locker network'),
(10, 2, 'Pallet', '5', 'Large shipment delivery service specifically designed for palletized goods and freight'),

(11, 3, 'Home to Home', '1', 'Standard door-to-door delivery service with pickup from sender address and delivery to recipient address'),
(12, 3, 'Home to Locker', '2', 'Delivery from sender address to a secure pickup locker for convenient recipient collection'),
(13, 3, 'Locker to Home', '3', 'Pickup from a drop-off locker with delivery directly to recipient address'),
(14, 3, 'Locker to Locker', '4', 'Full automated service using pickup and delivery through secure locker network'),
(15, 3, 'Pallet', '5', 'Large shipment delivery service specifically designed for palletized goods and freight'),

(16, 4, 'Home to Home', '1', 'Standard door-to-door delivery service with pickup from sender address and delivery to recipient address'),
(17, 4, 'Home to Locker', '2', 'Delivery from sender address to a secure pickup locker for convenient recipient collection'),
(18, 4, 'Locker to Home', '3', 'Pickup from a drop-off locker with delivery directly to recipient address'),
(19, 4, 'Locker to Locker', '4', 'Full automated service using pickup and delivery through secure locker network'),
(20, 4, 'Pallet', '5', 'Large shipment delivery service specifically designed for palletized goods and freight'),

(21, 6, 'Home to Home', '1', 'Standard door-to-door delivery service with pickup from sender address and delivery to recipient address'),
(22, 6, 'Home to Locker', '2', 'Delivery from sender address to a secure pickup locker for convenient recipient collection'),
(23, 6, 'Locker to Home', '3', 'Pickup from a drop-off locker with delivery directly to recipient address'),
(24, 6, 'Locker to Locker', '4', 'Full automated service using pickup and delivery through secure locker network'),
(25, 6, 'Pallet', '5', 'Large shipment delivery service specifically designed for palletized goods and freight'),

(26, 16, 'Home to Home', '1', 'Standard door-to-door delivery service with pickup from sender address and delivery to recipient address'),
(27, 16, 'Home to Locker', '2', 'Delivery from sender address to a secure pickup locker for convenient recipient collection'),
(28, 16, 'Locker to Home', '3', 'Pickup from a drop-off locker with delivery directly to recipient address'),
(29, 16, 'Locker to Locker', '4', 'Full automated service using pickup and delivery through secure locker network'),
(30, 16, 'Pallet', '5', 'Large shipment delivery service specifically designed for palletized goods and freight');