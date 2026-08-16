-- Update storage policies for better folder organization
-- Drop existing policies first
DROP POLICY IF EXISTS "Users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their product images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their product images" ON storage.objects;

-- Create updated policies for the new folder structure: user_id/product_id/filename
CREATE POLICY "Users can upload product images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'product-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND EXISTS (
    SELECT 1 FROM public.products 
    WHERE products.id::text = (storage.foldername(name))[2] 
    AND products.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their product images" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'product-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND EXISTS (
    SELECT 1 FROM public.products 
    WHERE products.id::text = (storage.foldername(name))[2] 
    AND products.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their product images" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'product-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND EXISTS (
    SELECT 1 FROM public.products 
    WHERE products.id::text = (storage.foldername(name))[2] 
    AND products.user_id = auth.uid()
  )
);