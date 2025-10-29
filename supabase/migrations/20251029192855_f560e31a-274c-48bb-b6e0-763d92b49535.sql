-- Create template_customization table for storing user's template settings
CREATE TABLE IF NOT EXISTS public.template_customization (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL DEFAULT 'elementar',
  
  -- Colors
  primary_color TEXT DEFAULT '#000000',
  background_color TEXT DEFAULT '#FFFFFF',
  text_color TEXT DEFAULT '#000000',
  accent_color TEXT DEFAULT '#666666',
  
  -- Images (stored as URLs from Supabase storage)
  hero_image_url TEXT,
  logo_url TEXT,
  
  -- Hero section content
  hero_title TEXT DEFAULT 'Welcome to Our Store',
  hero_subtitle TEXT DEFAULT 'Discover amazing products',
  hero_button_text TEXT DEFAULT 'Shop now',
  
  -- Store name
  store_name TEXT DEFAULT 'My Store',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, template_id)
);

-- Enable RLS
ALTER TABLE public.template_customization ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own template customization"
ON public.template_customization
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own template customization"
ON public.template_customization
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own template customization"
ON public.template_customization
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own template customization"
ON public.template_customization
FOR DELETE
USING (auth.uid() = user_id);

-- Public access for template viewing (by store_api_key)
CREATE POLICY "Anyone can view template customization for store API"
ON public.template_customization
FOR SELECT
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_template_customization_updated_at
BEFORE UPDATE ON public.template_customization
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for template images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('template-images', 'template-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for template images
CREATE POLICY "Users can upload their own template images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'template-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own template images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'template-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own template images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'template-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Template images are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'template-images');