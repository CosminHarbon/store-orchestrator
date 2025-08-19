-- Drop the incorrect policies first
DROP POLICY IF EXISTS "Users can upload collection images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view collection images" ON storage.objects;  
DROP POLICY IF EXISTS "Users can update collection images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete collection images" ON storage.objects;

-- Create corrected policies with the right folder structure
-- The path structure is: collections/user_id/collection_id/filename

-- Allow users to upload collection images
CREATE POLICY "Users can upload collection images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'product-images' 
  AND (storage.foldername(name))[1] = 'collections'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- Allow users to view collection images they uploaded
CREATE POLICY "Users can view collection images" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'product-images' 
  AND (storage.foldername(name))[1] = 'collections'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- Allow users to update their collection images
CREATE POLICY "Users can update collection images" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'product-images' 
  AND (storage.foldername(name))[1] = 'collections'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- Allow users to delete their collection images
CREATE POLICY "Users can delete collection images" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'product-images' 
  AND (storage.foldername(name))[1] = 'collections'
  AND auth.uid()::text = (storage.foldername(name))[2]
);