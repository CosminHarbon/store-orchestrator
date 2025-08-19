-- Add storage policies for collection images
-- Allow users to upload collection images in the collections/ folder
CREATE POLICY "Users can upload collection images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'product-images' 
  AND auth.uid()::text = (storage.foldername(name))[1] 
  AND (storage.foldername(name))[2] = 'collections'
);

-- Allow users to view collection images they uploaded
CREATE POLICY "Users can view collection images" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'product-images' 
  AND (
    -- Allow viewing their own collection images
    (auth.uid()::text = (storage.foldername(name))[1] AND (storage.foldername(name))[2] = 'collections')
    OR
    -- Keep existing product image access
    (storage.foldername(name))[2] != 'collections'
  )
);

-- Allow users to update their collection images
CREATE POLICY "Users can update collection images" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'product-images' 
  AND auth.uid()::text = (storage.foldername(name))[1] 
  AND (storage.foldername(name))[2] = 'collections'
);

-- Allow users to delete their collection images
CREATE POLICY "Users can delete collection images" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'product-images' 
  AND auth.uid()::text = (storage.foldername(name))[1] 
  AND (storage.foldername(name))[2] = 'collections'
);