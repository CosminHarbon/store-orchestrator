-- Clean up carriers and services based on actual capabilities
-- Delete Bookurier carrier completely
DELETE FROM carrier_services WHERE carrier_id = 16;
DELETE FROM carriers WHERE id = 16;

-- Delete Pallet service completely (service_code = '5')
DELETE FROM carrier_services WHERE service_code = '5';

-- Clear all existing services and rebuild with correct mappings
DELETE FROM carrier_services;

-- Insert correct services for each carrier based on actual capabilities
-- Service codes: 1=Home to Home, 2=Home to Locker, 3=Locker to Home, 4=Locker to Locker

-- Cargus (1): door to door, door to locker, locker to door
INSERT INTO carrier_services (carrier_id, name, service_code, description, is_active) VALUES
(1, 'Home to Home', '1', 'Door-to-door delivery service', true),
(1, 'Home to Locker', '2', 'Delivery from home to secure pickup locker', true),
(1, 'Locker to Home', '3', 'Pickup from locker with delivery to home', true);

-- DPD (2): door to door, door to locker, locker to door, locker to locker
INSERT INTO carrier_services (carrier_id, name, service_code, description, is_active) VALUES
(2, 'Home to Home', '1', 'Door-to-door delivery service', true),
(2, 'Home to Locker', '2', 'Delivery from home to secure pickup locker', true),
(2, 'Locker to Home', '3', 'Pickup from locker with delivery to home', true),
(2, 'Locker to Locker', '4', 'Full automated locker service', true);

-- FAN Courier (3): door to door, door to locker, locker to door, locker to locker
INSERT INTO carrier_services (carrier_id, name, service_code, description, is_active) VALUES
(3, 'Home to Home', '1', 'Door-to-door delivery service', true),
(3, 'Home to Locker', '2', 'Delivery from home to secure pickup locker', true),
(3, 'Locker to Home', '3', 'Pickup from locker with delivery to home', true),
(3, 'Locker to Locker', '4', 'Full automated locker service', true);

-- GLS (4): door to door only
INSERT INTO carrier_services (carrier_id, name, service_code, description, is_active) VALUES
(4, 'Home to Home', '1', 'Door-to-door delivery service', true);

-- Sameday (6): door to door, door to locker
INSERT INTO carrier_services (carrier_id, name, service_code, description, is_active) VALUES
(6, 'Home to Home', '1', 'Door-to-door delivery service', true),
(6, 'Home to Locker', '2', 'Delivery from home to secure pickup locker', true);