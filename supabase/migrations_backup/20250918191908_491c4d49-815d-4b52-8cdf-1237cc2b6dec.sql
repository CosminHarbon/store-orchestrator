-- Create carriers table to store different delivery companies
CREATE TABLE public.carriers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE, -- e.g., 'dpd', 'fan_courier', 'sameday'
  api_base_url TEXT NOT NULL,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create carrier_services table to store service types for each carrier
CREATE TABLE public.carrier_services (
  id SERIAL PRIMARY KEY,
  carrier_id INTEGER NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g., 'Standard', 'Express', 'Same Day'
  service_code TEXT NOT NULL, -- API service identifier
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(carrier_id, service_code)
);

-- Insert default carriers
INSERT INTO public.carriers (name, code, api_base_url, logo_url) VALUES
('DPD Romania', 'dpd', 'https://api.europarcel.com', 'https://www.dpd.com/ro/ro/wp-content/themes/dpd_ro/assets/images/dpd-logo.svg'),
('Fan Courier', 'fan_courier', 'https://api.fancourier.ro', null),
('Sameday', 'sameday', 'https://api.sameday.ro', null),
('Urgent Cargus', 'cargus', 'https://api.cargus.ro', null);

-- Insert default services for DPD (matching current eAWB API)
INSERT INTO public.carrier_services (carrier_id, name, service_code, description) VALUES
((SELECT id FROM public.carriers WHERE code = 'dpd'), 'De la ușă la ușă', '1', 'Standard door-to-door delivery service'),
((SELECT id FROM public.carriers WHERE code = 'dpd'), 'Express', '2', 'Fast delivery service'),
((SELECT id FROM public.carriers WHERE code = 'dpd'), 'Same Day', '3', 'Same day delivery service');

-- Enable RLS
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_services ENABLE ROW LEVEL SECURITY;

-- Create policies for carriers (public read, no write for now)
CREATE POLICY "Carriers are publicly viewable" 
ON public.carriers 
FOR SELECT 
USING (is_active = true);

-- Create policies for carrier_services (public read, no write for now) 
CREATE POLICY "Carrier services are publicly viewable"
ON public.carrier_services 
FOR SELECT 
USING (is_active = true);

-- Create updated_at triggers
CREATE TRIGGER update_carriers_updated_at
BEFORE UPDATE ON public.carriers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_carrier_services_updated_at
BEFORE UPDATE ON public.carrier_services
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();