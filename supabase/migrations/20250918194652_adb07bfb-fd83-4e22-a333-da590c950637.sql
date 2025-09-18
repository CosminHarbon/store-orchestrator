-- Add missing locker services to Sameday since easybox = sameday
-- Add Locker to Home and Locker to Locker services to Sameday (carrier_id = 6)

INSERT INTO carrier_services (carrier_id, name, service_code, description, is_active) VALUES
(6, 'Locker to Home', '3', 'Pickup from locker with delivery to home', true),
(6, 'Locker to Locker', '4', 'Full automated locker service', true);