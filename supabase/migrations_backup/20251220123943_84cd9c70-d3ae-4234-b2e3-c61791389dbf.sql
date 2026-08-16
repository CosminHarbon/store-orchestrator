-- Change the default value of is_approved to false (pending by default)
ALTER TABLE public.reviews ALTER COLUMN is_approved SET DEFAULT false;