-- Ensure the product-images bucket allows public access
UPDATE storage.buckets 
SET public = true 
WHERE id = 'product-images';

-- Allow public SELECT on objects in product-images bucket
CREATE POLICY "Public Access to Collection Images" 
ON storage.objects FOR SELECT 
TO public
USING (bucket_id = 'product-images');