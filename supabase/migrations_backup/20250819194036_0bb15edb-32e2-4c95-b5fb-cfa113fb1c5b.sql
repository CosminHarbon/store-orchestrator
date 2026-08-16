-- Ensure the product-images bucket allows public access for collection images
UPDATE storage.buckets 
SET public = true 
WHERE id = 'product-images';

-- Create policy to allow public read access to collection images
INSERT INTO storage.policies (id, bucket_id, policy_name, policy_definition, policy_for, policy_using)
VALUES (
  'collection-images-public-access',
  'product-images',
  'Public Access',
  'SELECT',
  'SELECT',
  'true'
) ON CONFLICT (id) DO NOTHING;

-- Allow public SELECT on objects in product-images bucket
CREATE POLICY IF NOT EXISTS "Public Access to Collection Images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'product-images');