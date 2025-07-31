-- Add configuration fields for each integration provider
ALTER TABLE public.profiles 
ADD COLUMN oblio_api_key TEXT,
ADD COLUMN oblio_name TEXT,
ADD COLUMN oblio_email TEXT,
ADD COLUMN sameday_api_key TEXT,
ADD COLUMN sameday_name TEXT,
ADD COLUMN sameday_email TEXT,
ADD COLUMN netpopia_api_key TEXT,
ADD COLUMN netpopia_name TEXT,
ADD COLUMN netpopia_email TEXT;