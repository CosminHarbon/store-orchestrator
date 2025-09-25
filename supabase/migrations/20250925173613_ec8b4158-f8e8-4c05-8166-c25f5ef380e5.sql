-- Insert carrier services data
INSERT INTO public.carrier_services (id, carrier_id, service_code, name, description, is_active, created_at, updated_at) VALUES
-- Service 1: Home to Home (available for carriers 1,2,3,4,6)
(1, 1, 'HOME_TO_HOME', 'Home to Home', 'Delivery from home address to home address', true, now(), now()),
(2, 2, 'HOME_TO_HOME', 'Home to Home', 'Delivery from home address to home address', true, now(), now()),
(3, 3, 'HOME_TO_HOME', 'Home to Home', 'Delivery from home address to home address', true, now(), now()),
(4, 4, 'HOME_TO_HOME', 'Home to Home', 'Delivery from home address to home address', true, now(), now()),
(5, 6, 'HOME_TO_HOME', 'Home to Home', 'Delivery from home address to home address', true, now(), now()),

-- Service 2: Home to Locker (available for carriers 1,2,3,6)
(6, 1, 'HOME_TO_LOCKER', 'Home to Locker', 'Delivery from home address to locker', true, now(), now()),
(7, 2, 'HOME_TO_LOCKER', 'Home to Locker', 'Delivery from home address to locker', true, now(), now()),
(8, 3, 'HOME_TO_LOCKER', 'Home to Locker', 'Delivery from home address to locker', true, now(), now()),
(9, 6, 'HOME_TO_LOCKER', 'Home to Locker', 'Delivery from home address to locker', true, now(), now()),

-- Service 3: Locker to Home (available for carriers 2,3,6)
(10, 2, 'LOCKER_TO_HOME', 'Locker to Home', 'Delivery from locker to home address', true, now(), now()),
(11, 3, 'LOCKER_TO_HOME', 'Locker to Home', 'Delivery from locker to home address', true, now(), now()),
(12, 6, 'LOCKER_TO_HOME', 'Locker to Home', 'Delivery from locker to home address', true, now(), now()),

-- Service 4: Locker to Locker (available for carriers 2,3,6)
(13, 2, 'LOCKER_TO_LOCKER', 'Locker to Locker', 'Delivery from locker to locker', true, now(), now()),
(14, 3, 'LOCKER_TO_LOCKER', 'Locker to Locker', 'Delivery from locker to locker', true, now(), now()),
(15, 6, 'LOCKER_TO_LOCKER', 'Locker to Locker', 'Delivery from locker to locker', true, now(), now());

-- Reset the sequence to continue from the highest ID
SELECT setval('carrier_services_id_seq', (SELECT MAX(id) FROM public.carrier_services));