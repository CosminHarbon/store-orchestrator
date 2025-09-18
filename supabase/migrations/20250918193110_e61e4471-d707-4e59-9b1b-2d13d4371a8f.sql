-- Fix carriers and services data properly
-- First clear existing data
DELETE FROM carrier_services;
DELETE FROM carriers;

-- Insert carriers with correct data
INSERT INTO carriers (id, name, code, api_base_url, is_active) VALUES 
(1, 'Cargus', 'cargus', 'https://api.europarcel.com', true),
(2, 'DPD', 'dpd', 'https://api.europarcel.com', true),
(3, 'FAN Courier', 'fan_courier', 'https://api.europarcel.com', true),
(4, 'GLS', 'gls', 'https://api.europarcel.com', true),
(6, 'Sameday', 'sameday', 'https://api.europarcel.com', true),
(16, 'Bookurier', 'bookurier', 'https://api.europarcel.com', true);

-- Insert carrier services for all carriers (all use the same service types)
INSERT INTO carrier_services (carrier_id, name, service_code, description, is_active) VALUES
-- Cargus services
(1, 'Home to Home', '1', 'Standard door-to-door delivery service', true),
(1, 'Home to Locker', '2', 'Delivery to secure pickup locker', true),
(1, 'Locker to Home', '3', 'Pickup from locker to home delivery', true),
(1, 'Locker to Locker', '4', 'Full automated locker service', true),
(1, 'Pallet', '5', 'Large shipment delivery service', true),

-- DPD services  
(2, 'Home to Home', '1', 'Standard door-to-door delivery service', true),
(2, 'Home to Locker', '2', 'Delivery to secure pickup locker', true),
(2, 'Locker to Home', '3', 'Pickup from locker to home delivery', true),
(2, 'Locker to Locker', '4', 'Full automated locker service', true),
(2, 'Pallet', '5', 'Large shipment delivery service', true),

-- FAN Courier services
(3, 'Home to Home', '1', 'Standard door-to-door delivery service', true),
(3, 'Home to Locker', '2', 'Delivery to secure pickup locker', true),
(3, 'Locker to Home', '3', 'Pickup from locker to home delivery', true),
(3, 'Locker to Locker', '4', 'Full automated locker service', true),
(3, 'Pallet', '5', 'Large shipment delivery service', true),

-- GLS services
(4, 'Home to Home', '1', 'Standard door-to-door delivery service', true),
(4, 'Home to Locker', '2', 'Delivery to secure pickup locker', true),
(4, 'Locker to Home', '3', 'Pickup from locker to home delivery', true),
(4, 'Locker to Locker', '4', 'Full automated locker service', true),
(4, 'Pallet', '5', 'Large shipment delivery service', true),

-- Sameday services
(6, 'Home to Home', '1', 'Standard door-to-door delivery service', true),
(6, 'Home to Locker', '2', 'Delivery to secure pickup locker', true),
(6, 'Locker to Home', '3', 'Pickup from locker to home delivery', true),
(6, 'Locker to Locker', '4', 'Full automated locker service', true),
(6, 'Pallet', '5', 'Large shipment delivery service', true),

-- Bookurier services
(16, 'Home to Home', '1', 'Standard door-to-door delivery service', true),
(16, 'Home to Locker', '2', 'Delivery to secure pickup locker', true),
(16, 'Locker to Home', '3', 'Pickup from locker to home delivery', true),
(16, 'Locker to Locker', '4', 'Full automated locker service', true),
(16, 'Pallet', '5', 'Large shipment delivery service', true);