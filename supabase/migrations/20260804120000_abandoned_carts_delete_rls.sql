-- Allow merchants to permanently delete their own abandoned carts (manual Clear only).
DROP POLICY IF EXISTS "Users can delete their own abandoned carts" ON public.abandoned_carts;
CREATE POLICY "Users can delete their own abandoned carts"
ON public.abandoned_carts
FOR DELETE
USING (auth.uid() = user_id);
