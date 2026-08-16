-- Enable Realtime so the merchant Orders page can update Pending Payments live
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'checkout_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.checkout_sessions;
  END IF;
END $$;
